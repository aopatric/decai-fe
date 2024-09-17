// mnist.ts
import * as ort from 'onnxruntime-web';

export class ImageDataLoader {
  // Define static properties
  static readonly BATCH_SIZE = 64;
  static readonly IMAGE_SIZE = 224; // Adjust as needed
  static readonly CHANNELS = 3; // For RGB images

  // Class name to integer label mapping
  private classNameToLabel: { [key: string]: number } = {
    'glioma': 0,
    'notumor': 1,
    // Add other classes if necessary
  };

  constructor(public batchSize = ImageDataLoader.BATCH_SIZE) {
    if (batchSize <= 0) {
      throw new Error('Batch size must be greater than 0');
    }
  }

  // Method to fetch image files
  private async fetchImageFiles(): Promise<{ image_path: string; label: string }[]> {
    try {
      const response = await fetch('/data/classification-train.json');

      if (!response.ok) {
        throw new Error(`Failed to fetch image files: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const files: { image_path: string; label: string }[] = await response.json();
        return files;
      } else {
        const text = await response.text();
        console.error('Response was not JSON:', text);
        throw new Error('Invalid response format: Expected JSON but received HTML or another format.');
      }
    } catch (error) {
      console.error('Error fetching image files:', error);
      return [];
    }
  }

  // Method to load and process an image
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
          floatData[idx++] = data[i] / 255; // R
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

  // Method to load images and labels
  private async loadImagesAndLabels(
    files: { image_path: string; label: string }[]
  ): Promise<{ images: ort.Tensor[]; labels: ort.Tensor[] }> {
    const images: ort.Tensor[] = [];
    const labels: ort.Tensor[] = [];

    for (const { image_path, label } of files) {
      try {
        const imageData = await this.loadImageData(image_path);

        images.push(
          new ort.Tensor(
            'float32',
            imageData,
            [1, ImageDataLoader.CHANNELS, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE] // NCHW format
          )
        );

        // Use the mapping to get the numeric label
        const labelKey = label.trim().toLowerCase();
        const labelValue = this.classNameToLabel[labelKey];
        if (labelValue === undefined) {
          console.error(`Unknown label '${label}' for image '${image_path}'. Skipping this image.`);
          continue; // Skip this image
        }
        labels.push(new ort.Tensor('int64', [BigInt(labelValue)], [1]));
      } catch (error) {
        console.error(`Error loading image or label from file: ${image_path}`, error);
      }
    }

    return { images, labels };
  }

  // Generate training batches
  public async *trainingBatches() {
    const trainFiles = await this.fetchImageFiles();
    const { images: trainImages, labels: trainLabels } = await this.loadImagesAndLabels(trainFiles);

    if (trainImages.length === 0 || trainLabels.length === 0) {
      console.error('No training data available.');
      return;
    }

    yield* this.batches(trainImages, trainLabels);
  }

  // Generate testing batches
  public async *testBatches() {
    const testFiles = await this.fetchImageFiles();
    const { images: testImages, labels: testLabels } = await this.loadImagesAndLabels(testFiles);

    if (testImages.length === 0 || testLabels.length === 0) {
      console.error('No testing data available.');
      return;
    }

    yield* this.batches(testImages, testLabels);
  }

  // Helper function to yield batches
  private *batches(data: ort.Tensor[], labels: ort.Tensor[]) {
    const totalSamples = data.length;
    if (totalSamples === 0) {
      console.error('No data available to create batches.');
      return;
    }

    for (let i = 0; i < totalSamples; i += this.batchSize) {
      const batchData = data.slice(i, i + this.batchSize);
      const batchLabels = labels.slice(i, i + this.batchSize);

      // Stack tensors in the batch
      if (batchData.length === 0 || batchLabels.length === 0) {
        continue; // Skip empty batches
      }

      const batchDataTensor = this.stackTensors(batchData, 'float32');
      const batchLabelsTensor = this.stackTensors(batchLabels, 'int64');

      yield { data: batchDataTensor, labels: batchLabelsTensor };
    }
  }

  // Helper function to stack tensors
  private stackTensors(tensors: ort.Tensor[], dtype: ort.Tensor.DataType): ort.Tensor {
    if (tensors.length === 0) {
      throw new Error('Cannot stack an empty array of tensors.');
    }

    const dims = tensors[0].dims;
    const batchDims = [tensors.length, ...dims.slice(1)];

    let stackedData: Float32Array | BigInt[];
    if (dtype === 'float32') {
      const totalSize = tensors.reduce((sum, t) => sum + t.data.length, 0);
      stackedData = new Float32Array(totalSize);
      let offset = 0;
      for (const tensor of tensors) {
        stackedData.set(tensor.data as Float32Array, offset);
        offset += tensor.data.length;
      }
    } else if (dtype === 'int64') {
      stackedData = [];
      for (const tensor of tensors) {
        const data = tensor.data as BigInt[];
        stackedData.push(...data);
      }
    } else {
      throw new Error(`Unsupported data type: ${dtype}`);
    }

    return new ort.Tensor(dtype, stackedData as any, batchDims);
  }
}
