import * as ort from 'onnxruntime-web/training';

export class ImageDataLoader {
  // Define static properties
  static readonly BATCH_SIZE = 64;
  static readonly IMAGE_SIZE = 28; // Example size, adjust based on your dataset
  static readonly CHANNELS = 3; // Set to 3 for RGB images

  constructor(public batchSize = ImageDataLoader.BATCH_SIZE) {
    if (batchSize <= 0) {
      throw new Error("Batch size must be greater than 0");
    }
  }

  // Method to fetch image files
  private async fetchImageFiles(): Promise<{ image_path: string, label: string }[]> {
    try {
      const response = await fetch('/data/classification-train.json');

      if (!response.ok) {
        throw new Error(`Failed to fetch image files: ${response.statusText}`);
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const files: { image_path: string, label: string }[] = await response.json();
        return files;
      } else {
        // Handle HTML response or other formats
        const text = await response.text();
        console.error("Response was not JSON:", text);
        throw new Error("Invalid response format: Expected JSON but received HTML or another format.");
      }
    } catch (error) {
      console.error("Error fetching image files:", error);
      return [];
    }
  }

  // Method to load images and labels
  private async loadImagesAndLabels(files: { image_path: string, label: string }[]): Promise<{ images: ort.Tensor[], labels: ort.Tensor[] }> {
    const images: ort.Tensor[] = [];
    const labels: ort.Tensor[] = [];

    for (const { image_path, label } of files) {
      try {
        const imageResponse = await fetch(image_path);
        const buffer = await imageResponse.arrayBuffer();

        // Process the image buffer as needed for your model
        const imageData = new Float32Array(buffer); // Example, adjust as needed
        images.push(new ort.Tensor('float32', imageData, [ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.CHANNELS]));

        // Convert the label to a tensor
        labels.push(new ort.Tensor('int64', [BigInt(label)], [1])); // Ensure label is properly formatted as an int64 tensor
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
    yield* this.batches(trainImages, trainLabels);
  }

  // Generate testing batches
  public async *testBatches() {
    const testFiles = await this.fetchImageFiles(); // Fetch testing files if you have a separate testing dataset
    const { images: testImages, labels: testLabels } = await this.loadImagesAndLabels(testFiles);
    yield* this.batches(testImages, testLabels);
  }

  // Helper function to yield batches
  private *batches(data: ort.Tensor[], labels: ort.Tensor[]) {
    for (let i = 0; i < data.length; i++) {
      yield { data: data[i], labels: labels[i] };
    }
  }
}
