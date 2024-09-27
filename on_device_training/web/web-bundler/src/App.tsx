// src/App.tsx
import React from "react";
import {
  Button,
  Container,
  Grid,
  Link,
  TextField,
  Switch,
  FormControlLabel,
  Typography,
  CircularProgress,
} from "@mui/material";
import Plot from "react-plotly.js";
import * as ortTraining from "onnxruntime-web/training";
import { ImageDataLoader } from "./minst"; // Corrected import path
import { Digit } from "./Digit"; // Ensure this path is correct

function App() {
  // Configuration Constants
  const lossNodeName = "onnx::loss::14"; 
  const outputNodeName = "output";

  // State Variables
  const [batchSize, setBatchSize] = React.useState<number>(ImageDataLoader.BATCH_SIZE);
  const [numEpochs, setNumEpochs] = React.useState<number>(5);
  const [trainingLosses, setTrainingLosses] = React.useState<number[]>([]);
  const [testAccuracies, setTestAccuracies] = React.useState<number[]>([]);
  const [images, setImages] = React.useState<{ pixels: Float32Array; label: number }[]>([]);
  const [imagePredictions, setImagePredictions] = React.useState<number[]>([]);
  const [isTraining, setIsTraining] = React.useState<boolean>(false);
  const [enableLiveLogging, setEnableLiveLogging] = React.useState<boolean>(false);
  const [statusMessage, setStatusMessage] = React.useState<string>("");
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [messages, setMessages] = React.useState<string[]>([]);

  // Reference to ImageDataLoader
  const dataLoaderRef = React.useRef<ImageDataLoader | null>(null);

  // Initialize ImageDataLoader on component mount or when batchSize changes
  React.useEffect(() => {
    dataLoaderRef.current = new ImageDataLoader(batchSize);
    loadImages();
    checkBrowserCompatibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSize]);

  /**
   * Checks browser compatibility for ONNX Runtime Web.
   */
  function checkBrowserCompatibility() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
      showErrorMessage(
        "This application may not work correctly on Safari. Please use Chrome or Edge."
      );
    }
  }

  /**
   * Displays a status message in the UI and logs it to the console.
   * @param message - The message to display and log.
   */
  function showStatusMessage(message: string) {
    console.log(message);
    setStatusMessage(message);
  }

  /**
   * Displays an error message in the UI and logs it to the console.
   * @param message - The error message to display and log.
   */
  function showErrorMessage(message: string) {
    console.error(message);
    setErrorMessage(message);
  }

  /**
   * Clears all output logs, messages, and status indicators.
   */
  function clearOutputs() {
    setTrainingLosses([]);
    setTestAccuracies([]);
    setMessages([]);
    setStatusMessage("");
    setErrorMessage("");
  }

  /**
   * Loads sample images to display in the UI.
   * @returns A promise that resolves when images are loaded.
   */
  const loadImages = React.useCallback(async () => {
    const maxNumImages = 18;
    const seenLabels = new Set<number>();
    const dataSet = dataLoaderRef.current!;
    const images: { pixels: Float32Array; label: number }[] = [];

    try {
      // Fetch test batches
      const testBatches = dataSet.testBatches();
      for await (const batch of testBatches) {
        const { data, labels } = batch;
        const currentBatchSize = labels.dims[0];
        const size = 784; // Since input is [batch_size, 784]

        for (let i = 0; i < currentBatchSize && images.length < maxNumImages; i++) {
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
    } catch (error) {
      console.error("Error loading images:", error);
      showErrorMessage(`Error loading images: ${error}`);
    }
  }, []);

  /**
   * Initializes and loads the training session.
   * @returns A promise that resolves to the initialized TrainingSession.
   */
  async function loadTrainingSession(): Promise<ortTraining.TrainingSession> {
    console.log("Attempting to load training session...");

    const chkptPath = "/checkpoint"; // Ensure this path is correct and accessible
    const trainingPath = "/training_model.onnx";
    const optimizerPath = "/optimizer_model.onnx";
    const evalPath = "/eval_model.onnx";

    const createOptions: ortTraining.TrainingSessionCreateOptions = {
      checkpointState: chkptPath,
      trainModel: trainingPath,
      evalModel: evalPath,
      optimizerModel: optimizerPath,
      // You can specify additional options here if needed
    };

    try {
      const session = await ortTraining.TrainingSession.create(createOptions);
      console.log("Training session loaded");
      return session;
    } catch (err) {
      console.error("Error loading the training session:", err);
      throw err;
    }
  }

  /**
   * Updates predictions for the sample images displayed in the UI.
   * @param session - The active TrainingSession.
   */
  async function updateImagePredictions(session: ortTraining.TrainingSession) {
    if (images.length === 0) return;

    const inputSize = 784; // 28x28 flattened
    const input = new Float32Array(images.length * inputSize);
    const batchShape = [images.length, inputSize];
    const labels: number[] = [];

    for (let i = 0; i < images.length; ++i) {
      const pixels = images[i].pixels;
      input.set(pixels, i * inputSize);
      labels.push(images[i].label);
    }

    const labelsBigIntArray = labels.map((label) => BigInt(label));

    const feeds = {
      input: new ortTraining.Tensor("float32", input, batchShape),
      labels: new ortTraining.Tensor("int64", labelsBigIntArray, [images.length]),
    };

    try {
      const results = await session.runEvalStep(feeds);
      const predictions = getPredictions(results[outputNodeName]);
      setImagePredictions(predictions.slice(0, images.length));
    } catch (error) {
      console.error("Error during image predictions update:", error);
      showErrorMessage(`Error during image predictions update: ${error}`);
    }
  }

  /**
   * Extracts prediction labels from the model's output tensor.
   * @param results - The output tensor from the model.
   * @returns An array of predicted label indices.
   */
  function getPredictions(results: ortTraining.Tensor): number[] {
    const predictions: number[] = [];
    const [batchSize, numClasses] = results.dims;

    for (let i = 0; i < batchSize; ++i) {
      const startIdx = i * numClasses;
      const endIdx = startIdx + numClasses;
      const probabilities = results.data.slice(startIdx, endIdx) as Float32Array;
      const predictedLabel = indexOfMax(probabilities);
      predictions.push(predictedLabel);
    }

    return predictions;
  }

  /**
   * Finds the index of the maximum value in a Float32Array.
   * @param arr - The array to search.
   * @returns The index of the maximum value.
   */
  function indexOfMax(arr: Float32Array): number {
    if (arr.length === 0) {
      throw new Error("Index of max expects a non-empty array.");
    }

    let maxIndex = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > arr[maxIndex]) {
        maxIndex = i;
      }
    }
    return maxIndex;
  }

  /**
   * Counts the number of correct predictions.
   * @param output - The model's output tensor.
   * @param labels - The true labels tensor.
   * @returns The count of correct predictions.
   */
  function countCorrectPredictions(
    output: ortTraining.Tensor,
    labels: ortTraining.Tensor
  ): number {
    let correct = 0;
    const predictions = getPredictions(output);
    for (let i = 0; i < predictions.length; ++i) {
      if (predictions[i] === Number(labels.data[i])) {
        correct++;
      }
    }
    return correct;
  }

  /**
   * Runs a single training epoch.
   * @param session - The active TrainingSession.
   * @param dataSet - The ImageDataLoader instance.
   * @param epoch - The current epoch number.
   * @returns The iterations per second for this epoch.
   */
  async function runTrainingEpoch(
    session: ortTraining.TrainingSession,
    dataSet: ImageDataLoader,
    epoch: number
  ): Promise<number> {
    let batchNum = 0;
    const epochStartTime = Date.now();
    let iterationsPerSecond = 0;
    await logMessage(
      `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting training...`
    );

    for await (const batch of dataSet.trainingBatches()) {
      batchNum++;

      const { data, labels } = batch;

      try {
        const results = await session.runTrainStep({ input: data, labels: labels });
        const lossArray = results[lossNodeName].data as Float32Array;
        const loss = Number(lossArray[0]);
        iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
        const message = `TRAINING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(
          batchNum
        ).padStart(3)} | Loss: ${loss.toFixed(4)} | ${iterationsPerSecond.toFixed(2)} it/s`;
        await logMessage(message);

        // Perform optimizer step and reset gradients
        await session.runOptimizerStep();
        await session.lazyResetGrad();

        // Update training losses for plotting
        setTrainingLosses((prevLosses) => [...prevLosses, loss]);

        // Optionally, update predictions on sample images
        await updateImagePredictions(session);
      } catch (error) {
        console.error(`Error during training batch ${batchNum} in epoch ${epoch}:`, error);
        showErrorMessage(
          `Error during training batch ${batchNum} in epoch ${epoch}: ${error}`
        );
        break;
      }
    }

    return iterationsPerSecond;
  }

  /**
   * Runs a single testing epoch.
   * @param session - The active TrainingSession.
   * @param dataSet - The ImageDataLoader instance.
   * @param epoch - The current epoch number.
   * @returns The average accuracy for this epoch.
   */
  async function runTestingEpoch(
    session: ortTraining.TrainingSession,
    dataSet: ImageDataLoader,
    epoch: number
  ): Promise<number> {
    let batchNum = 0;
    let numCorrect = 0;
    let testSamplesSoFar = 0;
    let accumulatedLoss = 0;
    const epochStartTime = Date.now();
    await logMessage(
      `TESTING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting testing...`
    );

    for await (const batch of dataSet.testBatches()) {
      batchNum++;
      const { data, labels } = batch;

      try {
        const results = await session.runEvalStep({ input: data, labels: labels });

        const lossArray = results[lossNodeName].data as Float32Array;
        const loss = Number(lossArray[0]);

        accumulatedLoss += loss;
        testSamplesSoFar += labels.dims[0];
        numCorrect += countCorrectPredictions(results[outputNodeName], labels);

        const iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
        const accuracy = (100 * numCorrect) / testSamplesSoFar;
        const message = `TESTING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(
          batchNum
        ).padStart(3)} | Avg Loss: ${(accumulatedLoss / batchNum).toFixed(2)} | Accuracy: ${
          numCorrect
        }/${testSamplesSoFar} (${accuracy.toFixed(2)}%) | ${iterationsPerSecond.toFixed(
          2
        )} it/s`;
        await logMessage(message);
      } catch (error) {
        console.error(`Error during testing batch ${batchNum} in epoch ${epoch}:`, error);
        showErrorMessage(
          `Error during testing batch ${batchNum} in epoch ${epoch}: ${error}`
        );
        break;
      }
    }

    const avgAcc = numCorrect / testSamplesSoFar;
    setTestAccuracies((prevAccs) => [...prevAccs, avgAcc]);
    return avgAcc;
  }

  /**
   * Logs a message to both the console and the UI.
   * @param message - The message to log.
   */
  async function logMessage(message: string) {
    console.log(message);
    setStatusMessage(message);
    if (enableLiveLogging) {
      setMessages((prevMessages) => [...prevMessages, message]);
    }
  }

  /**
   * Initiates the training process.
   */
  async function train() {
    clearOutputs();
    setIsTraining(true);
    try {
      console.log("Starting training process...");
      const trainingSession = await loadTrainingSession();
      console.log("Training session successfully loaded.");

      const dataSet = dataLoaderRef.current!;
      await updateImagePredictions(trainingSession);
      const startTrainingTime = Date.now();
      showStatusMessage("Training started");
      let itersPerSecCumulative = 0;
      let testAcc = 0;

      for (let epoch = 0; epoch < numEpochs; epoch++) {
        console.log(`Starting Epoch ${epoch + 1}`);
        itersPerSecCumulative += await runTrainingEpoch(trainingSession, dataSet, epoch);
        testAcc = await runTestingEpoch(trainingSession, dataSet, epoch);
      }

      const trainingTimeMs = Date.now() - startTrainingTime;
      showStatusMessage(
        `Training completed. Final test set accuracy: ${(100 * testAcc).toFixed(
          2
        )}% | Total training time: ${(trainingTimeMs / 1000).toFixed(
          2
        )} seconds | Average iterations / second: ${(itersPerSecCumulative / numEpochs).toFixed(2)}`
      );
    } catch (error) {
      console.error("Error during training:", error);
      if (typeof error === "number") {
        showErrorMessage(`Error during training: Received error code ${error}`);
      } else if (error instanceof Error) {
        showErrorMessage(`Error during training: ${error.message}`);
      } else {
        showErrorMessage(`Unknown error during training: ${JSON.stringify(error)}`);
      }
    } finally {
      setIsTraining(false);
    }
  }

  /**
   * Renders training and testing loss and accuracy plots.
   */
  function renderPlots() {
    const margin = { t: 20, r: 25, b: 25, l: 40 };
    return (
      <div className="section" style={{ marginTop: "40px" }}>
        <Typography variant="h5" gutterBottom>
          Training and Testing Metrics
        </Typography>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6">Training Loss</Typography>
            <Plot
              data={[
                {
                  x: trainingLosses.map((_, i) => i + 1),
                  y: trainingLosses,
                  type: "scatter",
                  mode: "lines+markers",
                  marker: { color: "blue" },
                },
              ]}
              layout={{
                margin,
                width: 500,
                height: 300,
                title: "Training Loss per Batch",
                xaxis: { title: "Batch Number" },
                yaxis: { title: "Loss" },
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="h6">Test Accuracy (%)</Typography>
            <Plot
              data={[
                {
                  x: testAccuracies.map((_, i) => i + 1),
                  y: testAccuracies.map((acc) => 100 * acc),
                  type: "scatter",
                  mode: "lines+markers",
                  marker: { color: "green" },
                },
              ]}
              layout={{
                margin,
                width: 500,
                height: 300,
                title: "Test Accuracy per Epoch",
                xaxis: { title: "Epoch" },
                yaxis: { title: "Accuracy (%)" },
              }}
            />
          </Grid>
        </Grid>
      </div>
    );
  }

  /**
   * Renders sample test images along with their true labels and model predictions.
   */
  function renderImages() {
    return (
      <div className="section" style={{ marginTop: "40px" }}>
        <Typography variant="h5" gutterBottom>
          Sample Test Images
        </Typography>
        <Grid container spacing={2}>
          {images.map((image, index) => (
            <Grid key={index} item xs={6} sm={4} md={2}>
              <Digit
                pixels={image.pixels}
                label={image.label}
                prediction={imagePredictions[index]}
              />
            </Grid>
          ))}
        </Grid>
      </div>
    );
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        ONNX Runtime Web On-Device Training Demo
      </Typography>
      <Typography variant="body1" gutterBottom>
        This demo showcases on-device training using{" "}
        <Link href="https://onnxruntime.ai/docs/" target="_blank" rel="noopener">
          ONNX Runtime Web
        </Link>{" "}
        for a simple image classification model on the MNIST dataset.
      </Typography>

      {/* Training Configuration */}
      <div className="section" style={{ marginTop: "20px" }}>
        <Typography variant="h6" gutterBottom>
          Training Configuration
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Number of Epochs"
              type="number"
              fullWidth
              value={numEpochs}
              onChange={(e) => setNumEpochs(Number(e.target.value))}
              disabled={isTraining}
              inputProps={{ min: 1 }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Batch Size"
              type="number"
              fullWidth
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isTraining}
              inputProps={{ min: 1 }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={enableLiveLogging}
                  onChange={() => setEnableLiveLogging(!enableLiveLogging)}
                  color="primary"
                  disabled={isTraining}
                />
              }
              label="Enable Live Logging (May Slow Down Training)"
            />
          </Grid>
        </Grid>
      </div>

      {/* Training Button */}
      <div className="section" style={{ marginTop: "20px" }}>
        <Button
          variant="contained"
          color="primary"
          onClick={train}
          disabled={isTraining}
          startIcon={isTraining ? <CircularProgress size={20} /> : null}
        >
          {isTraining ? "Training..." : "Start Training"}
        </Button>
      </div>

      {/* Status and Error Messages */}
      <div className="section" style={{ marginTop: "20px" }}>
        {statusMessage && (
          <Typography variant="body1" color="textPrimary">
            {statusMessage}
          </Typography>
        )}
        {errorMessage && (
          <Typography variant="body1" color="error">
            {errorMessage}
          </Typography>
        )}
      </div>

      {/* Plots */}
      {renderPlots()}

      {/* Sample Images */}
      {renderImages()}

      {/* Live Logs */}
      {messages.length > 0 && (
        <div className="section" style={{ marginTop: "40px" }}>
          <Typography variant="h6" gutterBottom>
            Logs
          </Typography>
          <pre
            style={{
              backgroundColor: "#f5f5f5",
              padding: "10px",
              maxHeight: "300px",
              overflowY: "scroll",
            }}
          >
            {messages.map((msg, idx) => (
              <div key={idx}>{msg}</div>
            ))}
          </pre>
        </div>
      )}
    </Container>
  );
}

export default App;
