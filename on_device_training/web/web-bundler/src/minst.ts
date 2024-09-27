// mnist.ts
import * as ort from 'onnxruntime-web';

interface MnistSample {
  image: number[];
  label: number;
}

interface Batch {
  data: ort.Tensor;
  labels: ort.Tensor;
}

export class ImageDataLoader {
  static readonly BATCH_SIZE = 64;
  static readonly IMAGE_SIZE = 28; // 28x28 pixels
  static readonly CHANNELS = 1;    // Grayscale images

  constructor(public batchSize = ImageDataLoader.BATCH_SIZE) {
    if (batchSize <= 0) {
      throw new Error("Batch size must be greater than 0");
    }
  }

  /**
   * Loads the MNIST dataset from a JSON file.
   * Assumes that the JSON file is an array of objects, each with 'image' and 'label' properties.
   * Each 'image' is an array of 784 pixel values (0-255).
   */
  private async loadMnistData(dataType: 'train' | 'test'): Promise<MnistSample[]> {
    // Update the paths to where your MNIST JSON files are located
    const dataPath = dataType === 'train' ? '/data/mnist_handwritten_train.json' : '/data/mnist_handwritten_test.json';

    try {
      const response = await fetch(dataPath);

      if (!response.ok) {
        throw new Error(`Failed to fetch MNIST ${dataType} data: ${response.statusText}`);
      }

      const data: MnistSample[] = await response.json();

      // Shuffle the data to randomize the order
      return this.shuffle(data);
    } catch (error) {
      console.error(`Error loading MNIST ${dataType} data:`, error);
      throw error;
    }
  }

  /**
   * Asynchronous generator that yields training batches.
   */
  public async *trainingBatches(): AsyncGenerator<Batch> {
    const samples = await this.loadMnistData('train');
    yield* this.batches(samples);
  }

  /**
   * Asynchronous generator that yields testing batches.
   */
  public async *testBatches(): AsyncGenerator<Batch> {
    const samples = await this.loadMnistData('test');
    yield* this.batches(samples);
  }

  /**
   * Helper generator function to yield batches of data and labels.
   * @param samples - An array of MnistSample objects.
   */
  private *batches(samples: MnistSample[]): Generator<Batch> {
    const totalSamples = samples.length;
    for (let i = 0; i < totalSamples; i += this.batchSize) {
      const batchSamples = samples.slice(i, i + this.batchSize);

      const batchSize = batchSamples.length;
      const dataSize = ImageDataLoader.IMAGE_SIZE * ImageDataLoader.IMAGE_SIZE; // 28x28 = 784

      const batchDataArray = new Float32Array(batchSize * dataSize);
      const labelsArray = new BigInt64Array(batchSize);

      for (let j = 0; j < batchSize; j++) {
        const sample = batchSamples[j];
        // Normalize pixel values and store in batchDataArray
        const normalizedImage = sample.image.map((pixel: number) => pixel / 255);
        batchDataArray.set(normalizedImage, j * dataSize);
        // Store label
        labelsArray[j] = BigInt(sample.label);
      }

      const batchDataTensor = new ort.Tensor('float32', batchDataArray, [batchSize, dataSize]);
      const batchLabelsTensor = new ort.Tensor('int64', labelsArray, [batchSize]);

      yield { data: batchDataTensor, labels: batchLabelsTensor };
    }
  }

  /**
   * Implements the Fisher-Yates shuffle algorithm to randomize an array.
   * @param array - The array to be shuffled.
   * @returns A new shuffled array.
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
