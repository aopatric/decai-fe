import * as ort from 'onnxruntime-web/training';

export class ImageDataLoader {
  static readonly BATCH_SIZE = 32; // Adjust batch size as needed
  static readonly IMAGE_SIZE = 224; // Size to resize images (e.g., 224x224 for most models)
  static readonly CHANNELS = 3; // For RGB images

  constructor(
    public batchSize = ImageDataLoader.BATCH_SIZE,
    public imageSize = ImageDataLoader.IMAGE_SIZE
  ) {
    if (batchSize <= 0) {
      throw new Error("batchSize must be > 0");
    }
  }

  public async *trainingBatches() {
    // Fetch training image files
    const trainingDirUrl = 'http://localhost:3000/datasets/Training';
    const trainFiles = await this.fetchImageFiles(trainingDirUrl);

    // Load training images and labels
    const { images: trainImages, labels: trainLabels } = await this.loadImagesAndLabels(trainingDirUrl, trainFiles);
    yield* this.batches(trainImages, trainLabels);
  }

  public async *testBatches() {
    // Fetch testing image files
    const testingDirUrl = 'http://localhost:3000/datasets/Testing';
    const testFiles = await this.fetchImageFiles(testingDirUrl);

    // Load testing images and labels
    const { images: testImages, labels: testLabels } = await this.loadImagesAndLabels(testingDirUrl, testFiles);
    yield* this.batches(testImages, testLabels);
  }

  private async *batches(data: ort.Tensor[], labels: ort.Tensor[]) {
    for (let batchIndex = 0; batchIndex < data.length; ++batchIndex) {
      yield {
        data: data[batchIndex],
        labels: labels[batchIndex],
      };
    }
  }

  private async fetchImageFiles(directory: string): Promise<string[]> {
    try {
      // Fetch the list of image files from the server-side directory
      const response = await fetch(directory);

      if (!response.ok) {
        throw new Error(`Failed to fetch image files: ${response.statusText}`);
      }

      // Assuming the server returns a JSON array of file paths
      const files: string[] = await response.json();

      // Convert file names to full URLs
      const imageUrls = files.map(file => `${directory}/${file}`);
      return imageUrls;
    } catch (error) {
      console.error("Error fetching image files:", error);
      return [];
    }
  }

  private async loadImagesAndLabels(directoryUrl: string, fileList: string[]): Promise<{ images: ort.Tensor[], labels: ort.Tensor[] }> {
    const images: ort.Tensor[] = [];
    const labels: ort.Tensor[] = [];

    // List of class names
    const classNames = ['glioma', 'notumor']; // Adjust based on your actual dataset structure

    for (const [labelIndex, className] of classNames.entries()) {
      // Filter files that belong to the current class
      const classFiles = fileList.filter(file => file.includes(className));

      for (let i = 0; i < classFiles.length; i += this.batchSize) {
        const batchImages = await Promise.all(
          classFiles.slice(i, i + this.batchSize).map(async (fileUrl) => {
            const image = await this.loadAndPreprocessImage(fileUrl);
            return image;
          })
        );

        // Concatenate the images into a single Float32Array
        const concatenatedImages = new Float32Array(batchImages.reduce((acc, cur) => acc + cur.length, 0));
        let offset = 0;
        batchImages.forEach((arr) => {
          concatenatedImages.set(arr, offset);
          offset += arr.length;
        });

        const imageTensor = new ort.Tensor('float32', concatenatedImages, [batchImages.length, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.CHANNELS]);
        images.push(imageTensor);

        // Create label tensor
        const labelTensor = new ort.Tensor('int64', new BigInt64Array(new Array(batchImages.length).fill(BigInt(labelIndex))), [batchImages.length]);
        labels.push(labelTensor);
      }
    }
    return { images, labels };
  }

  private async loadAndPreprocessImage(fileUrl: string): Promise<Float32Array> {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // Ensures CORS is handled
    image.src = fileUrl;

    // Wait for the image to load
    await new Promise((resolve) => (image.onload = resolve));

    // Create a canvas to resize and preprocess the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Failed to create canvas context for image processing.");
    }
    canvas.width = ImageDataLoader.IMAGE_SIZE;
    canvas.height = ImageDataLoader.IMAGE_SIZE;
    ctx.drawImage(image, 0, 0, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE);

    // Get image data from the canvas and normalize pixel values
    const imageData = ctx.getImageData(0, 0, ImageDataLoader.IMAGE_SIZE, ImageDataLoader.IMAGE_SIZE).data;
    const floatImageData = new Float32Array(imageData.length / 4 * ImageDataLoader.CHANNELS);

    for (let i = 0, j = 0; i < imageData.length; i += 4, j += 3) {
      // Normalize RGB values
      floatImageData[j] = imageData[i] / 255.0;        // R
      floatImageData[j + 1] = imageData[i + 1] / 255.0; // G
      floatImageData[j + 2] = imageData[i + 2] / 255.0; // B
    }

    return floatImageData;
  }
}
