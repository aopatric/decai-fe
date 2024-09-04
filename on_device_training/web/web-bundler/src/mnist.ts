// mnist.ts or ImageDataLoader.ts
import * as ort from 'onnxruntime-web/training';

export class ImageDataLoader {
  // Define static properties
  static readonly BATCH_SIZE = 64;
  static readonly IMAGE_SIZE = 28; // Example size, adjust based on your dataset
  static readonly CHANNELS = 1; // Example channel count, use 3 for RGB images

  constructor(public batchSize = ImageDataLoader.BATCH_SIZE) {
    if (batchSize <= 0) {
      throw new Error("Batch size must be greater than 0");
    }
  }

  // Method to fetch image files
  private async fetchImageFiles(directory: string): Promise<string[]> {
    try {
      const baseUrl = window.location.origin;
      const response = await fetch(`http://localhost:9000/datasets/Training`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image files: ${response.statusText}`);
      }

      const files: string[] = await response.json();
      return files.map(file => `http://localhost:9000/datasets/Testing`);
    } catch (error) {
      console.error("Error fetching image files:", error);
      return [];
    }
  }

  // Method to load images and labels
  private async loadImagesAndLabels(directory: string, files: string[]): Promise<{ images: ort.Tensor[], labels: ort.Tensor[] }> {
    const images: ort.Tensor[] = [];
    const labels: ort.Tensor[] = [];

    for (const file of files) {
        try {
            const imageResponse = await fetch(file);
            const buffer = await imageResponse.arrayBuffer();
            
            // Process the image buffer as needed for your model
            const imageData = new Float32Array(buffer); // Example, adjust as needed
            images.push(new ort.Tensor('float32', imageData, [ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.CHANNELS]));

            // Extract label from file path or filename, adjust as needed
            const label = parseInt(file.split('_')[1], 10); 
            labels.push(new ort.Tensor('int64', [BigInt(label)], [1])); // Corrected line to use an array of bigint
        } catch (error) {
            console.error(`Error loading image or label from file: ${file}`, error);
        }
    }

    return { images, labels };
}

  // Generate training batches
  public async *trainingBatches() {
    const baseUrl = window.location.origin;
    const trainingDirUrl = `http://localhost:9000/datasets/Training`;
    const trainFiles = await this.fetchImageFiles(trainingDirUrl);

    const { images: trainImages, labels: trainLabels } = await this.loadImagesAndLabels(trainingDirUrl, trainFiles);
    yield* this.batches(trainImages, trainLabels);
  }

  // Generate testing batches
  public async *testBatches() {
    const baseUrl = window.location.origin;
    const testingDirUrl = `http://localhost:9000/datasets/Testing`;
    const testFiles = await this.fetchImageFiles(testingDirUrl);

    const { images: testImages, labels: testLabels } = await this.loadImagesAndLabels(testingDirUrl, testFiles);
    yield* this.batches(testImages, testLabels);
  }

  // Helper function to yield batches
  private *batches(data: ort.Tensor[], labels: ort.Tensor[]) {
    for (let i = 0; i < data.length; i++) {
      yield { data: data[i], labels: labels[i] };
    }
  }
}
