import React from 'react';
import {
  Button,
  Container,
  Grid,
  Link,
  TextField,
  Switch,
  FormControlLabel,
} from '@mui/material';
import Plot from 'react-plotly.js';
import * as ort from 'onnxruntime-web';
import * as ortTraining from 'onnxruntime-web/training';
import { ImageDataLoader } from './minst'; // Use ImageDataLoader for image classification
import { Digit } from './Digit'; // Component to display images

function App() {
  const lossNodeName = "onnx::loss::14";
  const logIntervalMs = 1000;
  const waitAfterLoggingMs = 500;
  let lastLogTime = 0;
  let messagesQueue: string[] = [];

  const [maxNumTrainSamples, setMaxNumTrainSamples] = React.useState<number>(6400); // Example value
  const [maxNumTestSamples, setMaxNumTestSamples] = React.useState<number>(1280); // Example value

  const [batchSize, setBatchSize] = React.useState<number>(ImageDataLoader.BATCH_SIZE);
  const [numEpochs, setNumEpochs] = React.useState<number>(5);
  const [trainingLosses, setTrainingLosses] = React.useState<number[]>([]);
  const [testAccuracies, setTestAccuracies] = React.useState<number[]>([]);
  const [images, setImages] = React.useState<{ pixels: Float32Array; label: number }[]>([]);
  const [imagePredictions, setImagePredictions] = React.useState<number[]>([]);
  const [isTraining, setIsTraining] = React.useState<boolean>(false);
  const [enableLiveLogging, setEnableLiveLogging] = React.useState<boolean>(false);
  const [statusMessage, setStatusMessage] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [messages, setMessages] = React.useState<string[]>([]);

 

// Extend the SessionOptions interface
interface ExtendedSessionOptions extends ort.InferenceSession.SessionOptions {
  wasm?: {
    wasmPaths?: Record<string, string>;
    numThreads?: number;
    proxy?: boolean;
    worker?: string | URL;
    initTimeout?: number;
  };
}


  React.useEffect(() => {
    checkBrowserCompatibility();
  }, []);

  function checkBrowserCompatibility() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
     showErrorMessage('This application may not work correctly on Safari. Please use Chrome or Edge.');
    }
  }

  function showStatusMessage(message: string) {
    console.log(message);
    setStatusMessage(message);
  }

  function showErrorMessage(message: string) {
    console.error(message);
    setErrorMessage(message);
  }

  function addMessages(messagesToAdd: string[]) {
    setMessages((messages) => [...messages, ...messagesToAdd]);
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
      await new Promise((r) => setTimeout(r, waitAfterLoggingMs));
      lastLogTime = Date.now();
    }
  }

  function indexOfMax(arr: Float32Array): number {
    if (arr.length === 0) {
      throw new Error('Index of max expects a non-empty array.');
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
      const probabilities = results.data.slice(
        i * numClasses,
        (i + 1) * numClasses
      ) as Float32Array;
      const resultsLabel = indexOfMax(probabilities);
      predictions.push(resultsLabel);
    }
    return predictions;
  }

  function countCorrectPredictions(output: ort.Tensor, labels: ort.Tensor): number {
    let result = 0;
    const predictions = getPredictions(output);
    for (let i = 0; i < predictions.length; ++i) {
      if (predictions[i] === Number(labels.data[i])) {
        ++result;
      }
    }
    return result;
  }

//   async function runTrainingEpoch(
//     session: ort.TrainingSession,
//     dataSet: ImageDataLoader,
//     epoch: number
//   ) {
//     let batchNum = 0;
//     const epochStartTime = Date.now();
//     let iterationsPerSecond = 0;
//     await logMessage(
//       `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting training...`
//     );
  
//     for await (const batch of dataSet.trainingBatches()) {
//       ++batchNum;
  
//       // Log the shapes of the data and labels before feeding them to the model
//       console.log(`Training Batch ${batchNum} data shape:`, batch.data.dims);
//       console.log(`Training Batch ${batchNum} label shape:`, batch.labels.dims);
  
//       const feeds = {
//         input: batch.data,
//         labels: batch.labels,
//       };
  
//       try {
//         // Run training step
//         const results = await session.runTrainStep(feeds);
  
//         // Log the shape and type of the output tensor
//         console.log(`Training result output shape:`, results[lossNodeName].dims);
//         console.log(`Training result output type:`, typeof results[lossNodeName].data);
  
//         const lossArray = results[lossNodeName].data as Float32Array;
//         const loss = Number(lossArray[0]);
//         iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
  
//         const message = `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(
//           batchNum
//         ).padStart(3)} | Loss: ${loss.toFixed(4)} | ${iterationsPerSecond.toFixed(2)} it/s`;
//         await logMessage(message);
  
//         await session.runOptimizerStep();
//         await session.lazyResetGrad();
  
//         // Update training losses for plotting
//         setTrainingLosses((losses) => [...losses, loss]);
  
//         // Update image predictions
//         await updateImagePredictions(session);
//       } catch (error) {
//         console.error(`Error during training batch ${batchNum} in epoch ${epoch}:`, error);
//         showErrorMessage(`Error during training batch ${batchNum} in epoch ${epoch}: ${error}`);
//         break;
//       }
//     }
  
//     return iterationsPerSecond;
//   }
  

 async function runTestingEpoch(
  session: ort.TrainingSession,
  dataSet: ImageDataLoader,
  epoch: number
): Promise<number> {
  let batchNum = 0;
  let numCorrect = 0;
  let testPicsSoFar = 0;
  let accumulatedLoss = 0;
  const epochStartTime = Date.now();
  await logMessage(
    `TESTING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting testing...`
  );

  for await (const batch of dataSet.testBatches()) {
    ++batchNum;

    // Log the shapes of the data and labels before feeding them to the model
    console.log(`Testing Batch ${batchNum} data shape:`, batch.data.dims);
    console.log(`Testing Batch ${batchNum} label shape:`, batch.labels.dims);

    const feeds = {
      input: batch.data,
      labels: batch.labels,
    };

    try {
      // Run evaluation step
      const results = await session.runEvalStep(feeds);

      // Log the shape and type of the output tensor
      console.log(`Testing result output shape:`, results[lossNodeName].dims);
      console.log(`Testing result output type:`, typeof results[lossNodeName].data);

      const lossArray = results[lossNodeName].data as Float32Array;
      const loss = Number(lossArray[0]);

      accumulatedLoss += loss;
      testPicsSoFar += batch.data.dims[0];
      numCorrect += countCorrectPredictions(results['output'], batch.labels);

      const iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
      const message = `TESTING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(
        batchNum
      ).padStart(3)} | Average test loss: ${(accumulatedLoss / batchNum).toFixed(2)} | Accuracy: ${
        numCorrect
      }/${testPicsSoFar} (${((100 * numCorrect) / testPicsSoFar).toFixed(2)}%) | ${iterationsPerSecond.toFixed(2)} it/s`;
      await logMessage(message);
    } catch (error) {
      console.error(`Error during testing batch ${batchNum} in epoch ${epoch}:`, error);
      showErrorMessage(`Error during testing batch ${batchNum} in epoch ${epoch}: ${error}`);
      break;
    }
  }

  const avgAcc = numCorrect / testPicsSoFar;
  setTestAccuracies((accs) => accs.concat(avgAcc));
  return avgAcc;
}


  
    
    
    
async function train() {
  clearOutputs();
  setIsTraining(true);
  try {
    console.log("Starting training process..."); // Ensure this runs
    const trainingSession = await loadTrainingSession();
    console.log("Training session successfully loaded."); // Log session load confirmation
    const dataSet = new ImageDataLoader(batchSize);
    lastLogTime = Date.now();
    await updateImagePredictions(trainingSession);
    const startTrainingTime = Date.now();
    showStatusMessage('Training started');
    let itersPerSecCumulative = 0;
    let testAcc = 0;
    for (let epoch = 0; epoch < numEpochs; epoch++) {
      console.log(`Starting Epoch ${epoch + 1}`); // Log epoch number
      itersPerSecCumulative += await runTrainingEpoch(trainingSession, dataSet, epoch);
      testAcc = await runTestingEpoch(trainingSession, dataSet, epoch);
    }
    const trainingTimeMs = Date.now() - startTrainingTime;
    showStatusMessage(
      `Training completed. Final test set accuracy: ${(100 * testAcc).toFixed(
        2
      )}% | Total training time: ${trainingTimeMs / 1000} seconds | Average iterations / second: ${(
        itersPerSecCumulative / numEpochs
      ).toFixed(2)}`
    );
  } catch (error) {
    console.error("Primitive error during training:", error); // Explicit logging of error object
    showErrorMessage(`Error during training: ${error}`);
  }
  setIsTraining(false);
}

async function runTrainingEpoch(
  session: ort.TrainingSession,
  dataSet: ImageDataLoader,
  epoch: number
) {
  let batchNum = 0;
  const epochStartTime = Date.now();
  let iterationsPerSecond = 0;
  await logMessage(
    `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting training...`
  );
  
  console.log("Training epoch started"); // Log to check if training epoch starts
  
  for await (const batch of dataSet.trainingBatches()) {
    ++batchNum;
    
    console.log(`Training Batch ${batchNum} data shape:`, batch.data.dims); // Log data dimensions
    
    const feeds = {
      input: batch.data,
      labels: batch.labels,
    };

    try {
      const results = await session.runTrainStep(feeds);
      console.log("Training step completed for batch:", batchNum); // Log when training step completes
      const lossArray = results[lossNodeName].data as Float32Array;
      const loss = Number(lossArray[0]);
      iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
      const message = `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(
        batchNum
      ).padStart(3)} | Loss: ${loss.toFixed(4)} | ${iterationsPerSecond.toFixed(2)} it/s`;
      await logMessage(message);

      await session.runOptimizerStep();
      await session.lazyResetGrad();

      // Update training losses for plotting
      setTrainingLosses((losses) => [...losses, loss]);

      // Update image predictions
      await updateImagePredictions(session);
    } catch (error) {
      console.error(`Error during training batch ${batchNum} in epoch ${epoch}:`, error);
      showErrorMessage(`Error during training batch ${batchNum} in epoch ${epoch}: ${error}`);
      break;
    }
  }

  return iterationsPerSecond;
}



 
  
  async function loadTrainingSession(): Promise<ortTraining.TrainingSession> {
    console.log('Attempting to load training session...');
  
    const chkptPath = 'checkpoint';
    const trainingPath = 'training_model.onnx';
    const optimizerPath = 'optimizer_model.onnx';
    const evalPath = 'eval_model.onnx';
  
    const createOptions: ortTraining.TrainingSessionCreateOptions = {
      checkpointState: chkptPath,
      trainModel: trainingPath,
      evalModel: evalPath,
      optimizerModel: optimizerPath,
    };
  
    // Access SessionOptions via InferenceSession
    const sessionOptions: ExtendedSessionOptions = {
      executionProviders: ['wasm'],
      wasm: {
        wasmPaths: {
          'ort-training.wasm': '/ort-training-wasm-simd.wasm',
        },
        numThreads: 1, // Disable multithreading
      },
    };    
  
    try {
      const session = await ortTraining.TrainingSession.create(createOptions, sessionOptions);
      console.log('Training session loaded');
      return session;
    } catch (err) {
      console.error('Error loading the training session:', err);
      throw err;
    }
  }
  
  
  

  async function updateImagePredictions(session: ort.TrainingSession) {
    const inputSize =
      ImageDataLoader.CHANNELS * ImageDataLoader.IMAGE_SIZE * ImageDataLoader.IMAGE_SIZE;
    const input = new Float32Array(images.length * inputSize);
    const batchShape = [
      images.length,
      ImageDataLoader.CHANNELS,
      ImageDataLoader.IMAGE_SIZE,
      ImageDataLoader.IMAGE_SIZE,
    ];
    const labels: number[] = [];

    for (let i = 0; i < images.length; ++i) {
      const pixels = images[i].pixels;
      input.set(pixels, i * inputSize);
      labels.push(images[i].label);
    }

    const labelsBigIntArray = labels.map((label) => BigInt(label));

    const feeds = {
      input: new ort.Tensor('float32', input, batchShape),
      labels: new ort.Tensor('int64', labelsBigIntArray, [images.length]),
    };

    const results = await session.runEvalStep(feeds);
    const predictions = getPredictions(results['output']);
    setImagePredictions(predictions.slice(0, images.length));
  }

  function renderPlots() {
    const margin = { t: 20, r: 25, b: 25, l: 40 };
    return (
      <div className="section">
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
                },
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
                  y: testAccuracies.map((a) => 100 * a),
                  type: 'scatter',
                  mode: 'lines+markers',
                },
              ]}
              layout={{ margin, width: 400, height: 320 }}
            />
          </Grid>
        </Grid>
      </div>
    );
  }

  function renderImages() {
    return (
      <div className="section">
        <h4>Test Images</h4>
        <Grid container spacing={2}>
          {images.map((image, imageIndex) => {
            const { pixels, label } = image;
            const rgbPixels = getPixels(pixels, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE);
            return (
              <Grid key={imageIndex} item xs={6} sm={3} md={2}>
                <Digit pixels={rgbPixels} label={label} prediction={imagePredictions[imageIndex]} />
              </Grid>
            );
          })}
        </Grid>
      </div>
    );
  }

  function getPixels(data: Float32Array, numRows: number, numCols: number): number[][] {
    const result: number[][] = [];
    const numChannels = ImageDataLoader.CHANNELS;
    for (let row = 0; row < numRows; ++row) {
      const rowPixels: number[] = [];
      for (let col = 0; col < numCols; ++col) {
        const idx = (row * numCols + col) * numChannels;
        // For simplicity, take the average of RGB channels
        const pixelValue = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        rowPixels.push(pixelValue);
      }
      result.push(rowPixels);
    }
    return result;
  }

  const loadImages = React.useCallback(async () => {
    const maxNumImages = 18;
    const seenLabels = new Set<number>();
    const dataSet = new ImageDataLoader();
    const images: { pixels: Float32Array; label: number }[] = [];

    for await (const testBatch of dataSet.testBatches()) {
      const { data, labels } = testBatch;
      const batchSize = labels.dims[0];
      const size = data.dims[1] * data.dims[2] * data.dims[3];

      for (let i = 0; images.length < maxNumImages && i < batchSize; ++i) {
        const label = Number(labels.data[i]);
        if (seenLabels.size < 10 && seenLabels.has(label)) {
          continue;
        }
        seenLabels.add(label);
        const pixels = data.data.slice(i * size, (i + 1) * size) as Float32Array;
        images.push({ pixels, label });
      }

      if (images.length >= maxNumImages) {
        break;
      }
    }
    setImages(images);
  }, []);

  React.useEffect(() => {
    loadImages();
  }, [loadImages]);

  return (
    <Container className="App">
      <div className="section">
        <h2>ONNX Runtime Web Training Demo</h2>
        <p>
          This demo showcases using{' '}
          <Link href="https://onnxruntime.ai/docs/">ONNX Runtime Training for Web</Link> to train a
          simple neural network for image classification.
        </p>
      </div>
      <div className="section">
        <h3>Training</h3>
        <Grid container spacing={{ xs: 1, md: 2 }}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Number of epochs"
              type="number"
              value={numEpochs}
              onChange={(e) => setNumEpochs(Number(e.target.value))}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Batch size"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
            />
          </Grid>
        </Grid>
      </div>
      <div className="section">
        <Grid container spacing={{ xs: 1, md: 2 }}>
          <Grid item xs={12} md={4}>
            <TextField
              type="number"
              label="Max number of training samples"
              value={maxNumTrainSamples}
              onChange={(e) => setMaxNumTrainSamples(Number(e.target.value))}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              type="number"
              label="Max number of test samples"
              value={maxNumTestSamples}
              onChange={(e) => setMaxNumTestSamples(Number(e.target.value))}
            />
          </Grid>
        </Grid>
      </div>
      <div className="section">
        <FormControlLabel
          control={
            <Switch
              checked={enableLiveLogging}
              onChange={(e) => setEnableLiveLogging(!enableLiveLogging)}
            />
          }
          label="Log all batch results as they happen. Can slow down training."
        />
      </div>
      <div className="section">
        <Button onClick={train} disabled={isTraining} variant="contained">
          Train
        </Button>
        <br></br>
      </div>
      <pre>{statusMessage}</pre>
      {errorMessage && <p className="error">{errorMessage}</p>}

      {renderPlots()}

      {renderImages()}

      {messages.length > 0 && (
        <div>
          <h3>Logs:</h3>
          <pre>
            {messages.map((m, i) => (
              <React.Fragment key={i}>
                {m}
                <br />
              </React.Fragment>
            ))}
          </pre>
        </div>
      )}
    </Container>
  );
}

export default App;