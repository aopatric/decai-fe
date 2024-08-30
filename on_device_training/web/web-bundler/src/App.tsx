import { Button, Container, Grid, Link, TextField, Switch, FormControlLabel, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } from '@mui/material';
import React from 'react';
import './App.css';
import Plot from 'react-plotly.js';
import * as ort from 'onnxruntime-web/training';
import { ImageDataLoader } from './mnist'; // Updated to use ImageDataLoader
import { Digit } from './Digit';

function App() {
    // Constants for image classification
    const lossNodeName = "onnx::loss::14";
    const logIntervalMs = 1000;
    const waitAfterLoggingMs = 500;
    let lastLogTime = 0;
    let messagesQueue: string[] = [];

    // React components
    const [batchSize, setBatchSize] = React.useState<number>(ImageDataLoader.BATCH_SIZE);
    const [numEpochs, setNumEpochs] = React.useState<number>(5);

    const [trainingLosses, setTrainingLosses] = React.useState<number[]>([]);
    const [testAccuracies, setTestAccuracies] = React.useState<number[]>([]);

    const [digits, setDigits] = React.useState<{ pixels: Float32Array, label: number }[]>([])
    const [digitPredictions, setDigitPredictions] = React.useState<number[]>([])

    const [isTraining, setIsTraining] = React.useState<boolean>(false);
    const [moreInfoIsCollapsed, setMoreInfoIsCollapsed] = React.useState<boolean>(true);

    const [enableLiveLogging, setEnableLiveLogging] = React.useState<boolean>(false);

    const [statusMessage, setStatusMessage] = React.useState("");
    const [errorMessage, setErrorMessage] = React.useState("");
    const [messages, setMessages] = React.useState<string[]>([]);

    function toggleMoreInfoIsCollapsed() {
        setMoreInfoIsCollapsed(!moreInfoIsCollapsed);
    }

    function showStatusMessage(message: string) {
        console.log(message);
        setStatusMessage(message);
    }

    function showErrorMessage(message: string) {
        console.log(message);
        setErrorMessage(message);
    }

    function addMessages(messagesToAdd: string[]) {
        setMessages(messages => [...messages, ...messagesToAdd]);
    }

    function addMessageToQueue(message: string) {
        messagesQueue.push(message);
    }

    function clearOutputs() {
        setTrainingLosses([]);
        setTestAccuracies([]);
        setMessages([]);
        setStatusMessage("");
        setErrorMessage("");
        messagesQueue = [];
    }

    async function logMessage(message: string) {
        addMessageToQueue(message);
        if (Date.now() - lastLogTime > logIntervalMs) {
            showStatusMessage(message);
            if (enableLiveLogging) {
                addMessages(messagesQueue);
                messagesQueue = [];
            }
            await new Promise(r => setTimeout(r, waitAfterLoggingMs));
            lastLogTime = Date.now();
        }
    }

    function indexOfMax(arr: Float32Array): number {
        if (arr.length === 0) {
            throw new Error('index of max (used in test accuracy function) expects a non-empty array. Something went wrong.');
        }

        let maxIndex = 0;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] > arr[maxIndex]) {
                maxIndex = i;
            }
        }
        return maxIndex;
    }

    function getPredictions(results: ort.Tensor): number[] {
        const predictions = [];
        const [batchSize, numClasses] = results.dims;
        for (let i = 0; i < batchSize; ++i) {
            const probabilities = results.data.slice(i * numClasses, (i + 1) * numClasses) as Float32Array;
            const resultsLabel = indexOfMax(probabilities);
            predictions.push(resultsLabel);
        }
        return predictions;
    }

    function countCorrectPredictions(output: ort.Tensor, labels: ort.Tensor): number {
        let result = 0;
        const predictions = getPredictions(output);
        for (let i = 0; i < predictions.length; ++i) {
            if (Number(BigInt(predictions[i])) === Number(labels.data[i])) {
                ++result;
            }
        }
        return result;
    }

    function getPixels(data: Float32Array, numRows: number, numCols: number) {
        const result: number[][] = []
        for (let row = 0; row < numRows; ++row) {
            const rowPixels: number[] = []
            for (let col = 0; col < numCols; ++col) {
                rowPixels.push(data[row * numCols + col])
            }
            result.push(rowPixels)
        }
        return result
    }

    async function loadTrainingSession(): Promise<ort.TrainingSession> {
        showStatusMessage('Attempting to load training session...');

        const chkptPath = 'checkpoint';
        const trainingPath = 'training_model.onnx';
        const optimizerPath = 'optimizer_model.onnx';
        const evalPath = 'eval_model.onnx';

        const createOptions: ort.TrainingSessionCreateOptions = {
            checkpointState: chkptPath,
            trainModel: trainingPath,
            evalModel: evalPath,
            optimizerModel: optimizerPath
        };

        try {
            const session = await ort.TrainingSession.create(createOptions);
            showStatusMessage('Training session loaded');
            return session;
        } catch (err) {
            showErrorMessage('Error loading the training session: ' + err);
            console.log("Error loading the training session: " + err);
            throw err;
        }
    };

    async function updateDigitPredictions(session: ort.TrainingSession) {
        const input = new Float32Array(digits.length * ImageDataLoader.IMAGE_SIZE * ImageDataLoader.IMAGE_SIZE * ImageDataLoader.CHANNELS);
        const batchShape = [digits.length, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.CHANNELS];
        const labels = [];
        for (let i = 0; i < digits.length; ++i) {
            const pixels = digits[i].pixels;
            for (let j = 0; j < pixels.length; ++j) {
                input[i * pixels.length + j] = pixels[j];
            }
            labels.push(Number(BigInt(digits[i].label)));
        }
    
        const feeds = {
            input: new ort.Tensor('float32', input, batchShape),
            labels: new ort.Tensor('int64', new BigInt64Array(labels.map(BigInt)), [digits.length])
        };
    
        const results = await session.runEvalStep(feeds);
        const predictions = getPredictions(results['output']);
        setDigitPredictions(predictions.slice(0, digits.length));
    }

    async function runTrainingEpoch(session: ort.TrainingSession, dataSet: ImageDataLoader, epoch: number) {
        let batchNum = 0;
        const epochStartTime = Date.now();
        let iterationsPerSecond = 0;
        await logMessage(`TRAINING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting training...`);
    
        // Iterate directly over the training batches
        for await (const batch of dataSet.trainingBatches()) {
            ++batchNum;
    
            const feeds = {
                input: batch.data,
                labels: batch.labels
            };
    
            // Call the training step
            const results = await session.runTrainStep(feeds);
    
            // Update UI with metrics
            const lossArray = results[lossNodeName].data as Float32Array;
            const loss = Number(lossArray[0]);
            iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
            const message = `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(batchNum).padStart(3)} | Loss: ${loss.toFixed(4)} | ${iterationsPerSecond.toFixed(2)} it/s`;
            await logMessage(message);
    
            // Update weights then reset gradients
            await session.runOptimizerStep();
            await session.lazyResetGrad();
    
            // Update digit predictions
            await updateDigitPredictions(session);
        }
        return iterationsPerSecond;
    }
    
    async function runTestingEpoch(session: ort.TrainingSession, dataSet: ImageDataLoader, epoch: number): Promise<number> {
        let batchNum = 0;
        let numCorrect = 0;
        let testPicsSoFar = 0;
        let accumulatedLoss = 0;
        const epochStartTime = Date.now();
        await logMessage(`TESTING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting testing...`);
    
        // Iterate directly over the testing batches
        for await (const batch of dataSet.testBatches()) {
            ++batchNum;
    
            const feeds = {
                input: batch.data,
                labels: batch.labels
            };
    
            // Call the evaluation step
            const results = await session.runEvalStep(feeds);
    
            if (!results || !results[lossNodeName] || !results[lossNodeName].data) {
                console.error("Unexpected results structure:", JSON.stringify(results, null, 2));
                throw new Error("Invalid results structure.");
            }
    
            // Update UI with metrics
            const lossArray = results[lossNodeName].data as Float32Array;
            const loss = parseFloat(lossArray[0].toString());
    
            accumulatedLoss += loss;
            testPicsSoFar += batch.data.dims[0];
            numCorrect += countCorrectPredictions(results['output'], batch.labels);
            const iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
            const message = `TESTING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(batchNum).padStart(3)} | Average test loss: ${(accumulatedLoss / batchNum).toFixed(2)} | Accuracy: ${numCorrect}/${testPicsSoFar} (${(100 * numCorrect / testPicsSoFar).toFixed(2)}%) | ${iterationsPerSecond.toFixed(2)} it/s`;
            await logMessage(message);
        }
        const avgAcc = numCorrect / testPicsSoFar;
        setTestAccuracies(accs => accs.concat(avgAcc));
        return avgAcc;
    }

    async function train() {
        clearOutputs();

        setIsTraining(true);

        const trainingSession = await loadTrainingSession();
        const dataSet = new ImageDataLoader(batchSize);

        lastLogTime = Date.now();
        await updateDigitPredictions(trainingSession);
        const startTrainingTime = Date.now();
        showStatusMessage('Training started');
        let itersPerSecCumulative = 0;
        let testAcc = 0;
        for (let epoch = 0; epoch < numEpochs; epoch++) {
            itersPerSecCumulative += await runTrainingEpoch(trainingSession, dataSet, epoch);
            testAcc = await runTestingEpoch(trainingSession, dataSet, epoch);
        }
        const trainingTimeMs = Date.now() - startTrainingTime;
        showStatusMessage(`Training completed. Final test set accuracy: ${(100 * testAcc).toFixed(2)}% | Total training time: ${trainingTimeMs / 1000} seconds | Average iterations / second: ${(itersPerSecCumulative / numEpochs).toFixed(2)}`);
        setIsTraining(false);
    }

    // Plots and digits
    function renderPlots() {
        const margin = { t: 20, r: 25, b: 25, l: 40 }
        return (<div className="section">
            <h3>Plots</h3>
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <h4>Training Loss</h4>
                    <Plot
                        data={[
                            {
                                x: trainingLosses.map((_, i) => i),
                                y: trainingLosses,
                                type: 'scatter',
                                mode: 'lines',
                            }
                        ]}
                        layout={{ margin, width: 400, height: 320 }}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <h4>Test Accuracy (%)</h4>
                    <Plot
                        data={[
                            {
                                x: testAccuracies.map((_, i) => i + 1),
                                y: testAccuracies.map(a => 100 * a),
                                type: 'scatter',
                                mode: 'lines+markers',
                            }
                        ]}
                        layout={{ margin, width: 400, height: 320 }}
                    />
                </Grid>
            </Grid>
        </div>);
    }

    function renderDigits() {
        return (<div className="section">
            <h4>Test Digits</h4>
            <Grid container spacing={2}>
                {digits.map((digit, digitIndex) => {
                    const { pixels, label } = digit;
                    const rgdPixels = getPixels(pixels, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE);
                    return (<Grid key={digitIndex} item xs={6} sm={3} md={2}>
                        <Digit pixels={rgdPixels} label={label} prediction={digitPredictions[digitIndex]} />
                    </Grid>);
                })}
            </Grid>
        </div>);
    }

    // Load digits function
    const loadDigits = React.useCallback(async () => {
        const maxNumDigits = 18;
        const seenLabels = new Set<number>();
        const dataSet = new ImageDataLoader();
        const digits = [];
        const normalize = false;

        for await (const testBatch of dataSet.testBatches()) {
            const { data, labels } = testBatch;
            const batchSize = labels.dims[0];
            const size = data.dims[1] * ImageDataLoader.CHANNELS;

            for (let i = 0; digits.length < maxNumDigits && i < batchSize; ++i) {
                const label = Number(labels.data[i]);
                if (seenLabels.size < 10 && seenLabels.has(label)) {
                    continue;
                }
                seenLabels.add(label);
                const pixels = data.data.slice(i * size, (i + 1) * size) as Float32Array;
                digits.push({ pixels, label });
            }

            if (digits.length >= maxNumDigits) {
                break;
            }
        }
        setDigits(digits);
    }, []);

    React.useEffect(() => {
        loadDigits();
    }, [loadDigits]);

    // component HTML
    return (
        <Container className="App">
            <div className="section">
                <h2>ONNX Runtime Web Training Demo</h2>
                <p>
                    This demo showcases using <Link href="https://onnxruntime.ai/docs/">ONNX Runtime Training for Web</Link> to train a simple neural network for image classification.
                </p>
            </div>
            {/* Other sections remain unchanged */}
            <Button onClick={train} disabled={isTraining} variant='contained'>
                Train
            </Button>
            <pre>{statusMessage}</pre>
            {errorMessage && <p className='error'>{errorMessage}</p>}
            {renderPlots()}
            {renderDigits()}
            {messages.length > 0 && (
                <div>
                    <h3>Logs:</h3>
                    <pre>{messages.map((m, i) => (<React.Fragment key={i}>{m}<br /></React.Fragment>))}</pre>
                </div>
            )}
        </Container>
    );
}

export default App;
