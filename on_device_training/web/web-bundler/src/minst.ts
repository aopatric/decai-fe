// mnist.ts
import * as ort from 'onnxruntime-web';

interface ImageFile {
  image_path: string;
  label: string;
}

interface Batch {
  data: ort.Tensor;
  labels: ort.Tensor;
}

export class ImageDataLoader {
  // Define static properties
  static readonly BATCH_SIZE = 64;
  static readonly IMAGE_SIZE = 224; // Reduced from 512 for better performance
  static readonly CHANNELS = 3; // Set to 3 for RGB images

  // Class name to integer label mapping
  private classNameToLabel: { [key: string]: number } = {
    'glioma': 0,
    'notumor': 1,
    // Add other classes as needed
  };

  constructor(public batchSize = ImageDataLoader.BATCH_SIZE) {
    if (batchSize <= 0) {
      throw new Error("Batch size must be greater than 0");
    }
  }

  /**
   * Fetches image file metadata from a specified JSON path.
   * @param jsonPath - The path to the JSON file containing image paths and labels.
   * @returns A shuffled array of ImageFile objects.
   */
  private async fetchImageFiles(jsonPath: string): Promise<ImageFile[]> {
    try {
      const response = await fetch(jsonPath);

      if (!response.ok) {
        throw new Error(`Failed to fetch image files: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const files: ImageFile[] = await response.json();
        return this.shuffle(files); // Shuffle the files for randomness
      } else {
        const text = await response.text();
        console.error("Response was not JSON:", text);
        throw new Error("Invalid response format: Expected JSON but received HTML or another format.");
      }
    } catch (error) {
      console.error("Error fetching image files:", error);
      return [];
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

  /**
   * Loads and processes an image from a given path.
   * @param imagePath - The path to the image file.
   * @returns A normalized Float32Array representing the image data.
   */
  private async loadImageData(imagePath: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Handle CORS if necessary
      img.src = imagePath;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = ImageDataLoader.IMAGE_SIZE;
        canvas.height = ImageDataLoader.IMAGE_SIZE;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not create canvas context'));
          return;
        }

        // Draw and resize the image on the canvas
        ctx.drawImage(img, 0, 0, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE);

        // Get pixel data from the canvas
        const imageData = ctx.getImageData(0, 0, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE);
        const data = imageData.data; // Uint8ClampedArray with RGBA values

        // Prepare a Float32Array for the model input
        const floatData = new Float32Array(
          ImageDataLoader.CHANNELS * ImageDataLoader.IMAGE_SIZE * ImageDataLoader.IMAGE_SIZE
        );

        // Convert pixel data to Float32 and normalize
        let idx = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Normalize RGB values to [0, 1]
          floatData[idx++] = data[i] / 255;     // R
          floatData[idx++] = data[i + 1] / 255; // G
          floatData[idx++] = data[i + 2] / 255; // B
          // Ignore the Alpha channel (data[i + 3])
        }

        resolve(floatData);
      };

      img.onerror = (error) => {
        console.error(`Failed to load image: ${imagePath}`, error);
        reject(new Error(`Failed to load image: ${imagePath}`));
      };
    });
  }

  /**
   * Loads images and their corresponding labels, converting them into ONNX Runtime tensors.
   * Utilizes controlled concurrency to optimize performance without overwhelming resources.
   * @param files - An array of ImageFile objects containing image paths and labels.
   * @param maxConcurrency - The maximum number of concurrent image loading operations.
   * @returns An object containing arrays of image and label tensors.
   */
  private async loadImagesAndLabels(
    files: ImageFile[],
    maxConcurrency: number = 8
  ): Promise<{ images: ort.Tensor[]; labels: ort.Tensor[] }> {
    const images: ort.Tensor[] = [];
    const labels: ort.Tensor[] = [];

    const queue = [...files];
    let activePromises: Promise<void>[] = [];

    const processNext = async () => {
      if (queue.length === 0) return;

      const { image_path, label } = queue.shift()!;

      try {
        const imageData = await this.loadImageData(image_path);

        // Create tensor for image
        const imageTensor = new ort.Tensor(
          'float32',
          imageData,
          [1, ImageDataLoader.CHANNELS, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE] // NCHW format
        );
        images.push(imageTensor);

        // Map label to integer
        const labelKey = label.trim().toLowerCase();
        const labelValue = this.classNameToLabel[labelKey];
        if (labelValue === undefined) {
          console.error(`Unknown label '${label}' for image '${image_path}'. Skipping this image.`);
          return; // Skip this image
        }

        // Create tensor for label
        const labelTensor = new ort.Tensor('int64', [BigInt(labelValue)], [1]);
        labels.push(labelTensor);
      } catch (error) {
        console.error(`Error loading image or label from file: ${image_path}`, error);
        // Optionally, track failed images
      }

      await processNext();
    };

    // Initialize concurrent processing
    for (let i = 0; i < maxConcurrency; i++) {
      activePromises.push(processNext());
    }

    await Promise.all(activePromises);

    return { images, labels };
  }

  /**
   * Asynchronous generator that yields training batches.
   * @param trainJsonPath - The path to the training JSON file.
   */
  public async *trainingBatches(trainJsonPath: string): AsyncGenerator<Batch> {
    const trainFiles = await this.fetchImageFiles(trainJsonPath);
    const { images: trainImages, labels: trainLabels } = await this.loadImagesAndLabels(trainFiles);

    yield* this.batches(trainImages, trainLabels);
  }

  /**
   * Asynchronous generator that yields testing batches.
   * @param testJsonPath - The path to the testing JSON file.
   */
  public async *testBatches(testJsonPath: string): AsyncGenerator<Batch> {
    const testFiles = await this.fetchImageFiles(testJsonPath);
    const { images: testImages, labels: testLabels } = await this.loadImagesAndLabels(testFiles);

    yield* this.batches(testImages, testLabels);
  }

  /**
   * Helper generator function to yield batches of data and labels.
   * @param data - An array of image tensors.
   * @param labels - An array of label tensors.
   */
  private *batches(data: ort.Tensor[], labels: ort.Tensor[]): Generator<Batch> {
    const totalSamples = data.length;
    for (let i = 0; i < totalSamples; i += this.batchSize) {
      const batchData = data.slice(i, i + this.batchSize);
      const batchLabels = labels.slice(i, i + this.batchSize);

      // Stack tensors in the batch
      const batchDataTensor = this.stackTensors(batchData, 'float32');
      const batchLabelsTensor = this.stackTensors(batchLabels, 'int64');

      yield { data: batchDataTensor, labels: batchLabelsTensor };
    }
  }

  /**
   * Helper function to stack multiple tensors into a single batched tensor.
   * Ensures all tensors have the same dimensions before stacking.
   * @param tensors - An array of tensors to be stacked.
   * @param dtype - The data type of the tensors ('float32' or 'int64').
   * @returns A new tensor representing the stacked batch.
   */
  private stackTensors(tensors: ort.Tensor[], dtype: 'float32' | 'int64'): ort.Tensor {
    if (tensors.length === 0) {
      throw new Error("No tensors provided for stacking.");
    }

    const firstDims = tensors[0].dims;
    for (const tensor of tensors) {
      if (JSON.stringify(tensor.dims) !== JSON.stringify(firstDims)) {
        throw new Error("All tensors must have the same dimensions to be stacked.");
      }
    }

    const batchDims = [tensors.length, ...firstDims.slice(1)];
    const totalSize = tensors.reduce((sum, t) => sum + t.data.length, 0);

    let stackedData: Float32Array | BigInt64Array;
    if (dtype === 'float32') {
      stackedData = new Float32Array(totalSize);
    } else if (dtype === 'int64') {
      stackedData = new BigInt64Array(totalSize);
    } else {
      throw new Error(`Unsupported data type: ${dtype}`);
    }

    let offset = 0;
    for (const tensor of tensors) {
      if (dtype === 'float32') {
        (stackedData as Float32Array).set(tensor.data as Float32Array, offset);
      } else if (dtype === 'int64') {
        (stackedData as BigInt64Array).set(tensor.data as BigInt64Array, offset);
      }
      offset += tensor.data.length;
    }

    return new ort.Tensor(dtype, stackedData, batchDims);
  }
}
