import * as ort from 'onnxruntime-web';

interface ImageSample {
  image: number[];
  label: number;
}

interface Batch {
  data: ort.Tensor;
  labels: ort.Tensor;
}

export class ImageDataLoader {
  static readonly IMAGE_SIZE = 28; // 28x28 pixels
  static readonly CHANNELS = 1;    // Grayscale images
  private batchSize: number;

  constructor(batchSize: number = 64) {
    if (batchSize <= 0) {
      throw new Error("Batch size must be greater than 0");
    }
    this.batchSize = batchSize;
  }

  /**
   * Loads the dataset from a JSON file.
   * Assumes that the JSON file is an array of objects, each with 'image' and 'label' properties.
   */
  private async loadDataset(dataType: 'train' | 'test'): Promise<ImageSample[]> {
    // Update the paths to where your dataset JSON files are located
    const dataPath = dataType === 'train' ? '/data/bloodmnist_train.json' : '/data/bloodmnist_test.json';

    try {
      const response = await fetch(dataPath);

      if (!response.ok) {
        throw new Error(`Failed to fetch dataset ${dataType} data: ${response.statusText}`);
      }

      const data: ImageSample[] = await response.json();
      return this.shuffle(data);
    } catch (error) {
      console.error(`Error loading dataset ${dataType} data:`, error);
      throw error;
    }
  }

  /**
   * Helper function to shuffle the dataset for randomness.
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Asynchronous generator to yield batches for training.
   */
  public async *trainingBatches(): AsyncGenerator<Batch> {
    const samples = await this.loadDataset('train');
    yield* this.createBatches(samples);
  }

  /**
   * Asynchronous generator to yield batches for testing.
   */
  public async *testBatches(): AsyncGenerator<Batch> {
    const samples = await this.loadDataset('test');
    yield* this.createBatches(samples);
  }

  /**
   * Generator function to create batches from the dataset.
   */
  private *createBatches(samples: ImageSample[]): Generator<Batch> {
    const totalSamples = samples.length;
    const dataSize = ImageDataLoader.IMAGE_SIZE * ImageDataLoader.IMAGE_SIZE; // 28x28 = 784

    for (let i = 0; i < totalSamples; i += this.batchSize) {
      const batchSamples = samples.slice(i, i + this.batchSize);

      const batchSize = batchSamples.length;
      const batchDataArray = new Float32Array(batchSize * dataSize);
      const labelsArray = new BigInt64Array(batchSize);

      for (let j = 0; j < batchSize; j++) {
        const sample = batchSamples[j];

        // Debugging: Log image size
        console.log(`Processing sample ${i + j}: Image size = ${sample.image.length}`);

        let grayscaleImage: number[];

        if (sample.image.length === dataSize * 3) { // RGB Image
          grayscaleImage = this.convertRGBToGrayscale(sample.image);
        } else if (sample.image.length === dataSize) { // Grayscale Image
          grayscaleImage = sample.image;
        } else {
          throw new Error(`Sample ${i + j} has ${sample.image.length} pixels, expected ${dataSize} or ${dataSize * 3}`);
        }

        // Normalize the pixel values (0-255) to (0-1)
        const normalizedImage = grayscaleImage.map((pixel: number) => pixel / 255);
        batchDataArray.set(normalizedImage, j * dataSize);
        labelsArray[j] = BigInt(sample.label);
      }

      const batchDataTensor = new ort.Tensor('float32', batchDataArray, [batchSize, dataSize]);
      const batchLabelsTensor = new ort.Tensor('int64', labelsArray, [batchSize]);

      yield { data: batchDataTensor, labels: batchLabelsTensor };
    }
  }

  /**
   * Converts an RGB image to grayscale using the luminosity method.
   * @param rgbPixels - The flat array of RGB pixel values.
   * @returns A flat array of grayscale pixel values.
   */
  private convertRGBToGrayscale(rgbPixels: number[]): number[] {
    const grayscale: number[] = [];
    for (let k = 0; k < rgbPixels.length; k += 3) {
      const r = rgbPixels[k];
      const g = rgbPixels[k + 1];
      const b = rgbPixels[k + 2];
      // Luminosity method
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      grayscale.push(gray);
    }
    return grayscale;
  }
}
