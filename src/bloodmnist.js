
// dataloading class for bloodmnist
export class BloodMNIST {
    constructor(ort, batchSize = 32, maxNumTrainSamples = 6400, maxNumTestSamples = 1280) {
        this.ort = ort;
        this.batchSize = batchSize;
        this.maxNumTrainSamples = Math.min(maxNumTrainSamples, BloodMNIST.MAX_NUM_TRAIN_SAMPLES);
        this.maxNumTestSamples = Math.min(maxNumTestSamples, BloodMNIST.MAX_NUM_TEST_SAMPLES);
        
        // Constants specific to BloodMNIST
        this.IMAGE_H = 28;  // Height of each image
        this.IMAGE_W = 28;  // Width of each image
        this.IMAGE_C = 3;   // Channels (3 for RGB)
        this.NUM_CLASSES = 8; // Number of blood cell types
        
        this.trainData = null;
        this.testData = null;
    }

    static MAX_NUM_TRAIN_SAMPLES = 6400;  // Adjust based on your dataset size
    static MAX_NUM_TEST_SAMPLES = 1280;   // Adjust based on your dataset size
    static BATCH_SIZE = 32;

    // Normalize the pixel values to the range [0, 1]
    static normalize(pixel) {
        return pixel / 255.0;
    }

    async loadData() {
        try {
            // Load training data
            const trainResponse = await fetch('public/data/bloodmnist_train.json');
            this.trainData = await trainResponse.json();
            
            // Load test data
            const testResponse = await fetch('public/data/bloodmnist_test.json');
            this.testData = await testResponse.json();
            
            // Limit the number of samples if needed
            this.trainData = this.trainData.slice(0, this.maxNumTrainSamples);
            this.testData = this.testData.slice(0, this.maxNumTestSamples);

            console.log(`Loaded ${this.trainData.length} training samples and ${this.testData.length} test samples`);
        } catch (error) {
            console.error('Error loading BloodMNIST data:', error);
            throw error;
        }
    }

    getNumTrainingBatches() {
        return Math.ceil(this.trainData.length / this.batchSize);
    }

    getNumTestBatches() {
        return Math.ceil(this.testData.length / this.batchSize);
    }

    // Generator function for training batches
    async *trainingBatches(normalize = true) {
        for (let i = 0; i < this.trainData.length; i += this.batchSize) {
            const batchData = this.trainData.slice(i, i + this.batchSize);
            const batchSize = batchData.length;

            // Initialize arrays for the batch
            const input = new Float32Array(batchSize * this.IMAGE_H * this.IMAGE_W * this.IMAGE_C);
            const labels = new BigInt64Array(batchSize);

            // Fill the arrays
            batchData.forEach((sample, index) => {
                // Flatten and normalize image data
                const pixels = sample.image;
                for (let j = 0; j < pixels.length; j++) {
                    input[index * (this.IMAGE_H * this.IMAGE_W * this.IMAGE_C) + j] = 
                        normalize ? BloodMNIST.normalize(pixels[j]) : pixels[j];
                }
                labels[index] = BigInt(sample.label);
            });

            // Yield the batch
            yield {
                data: new this.ort.Tensor('float32', input, [batchSize, this.IMAGE_H * this.IMAGE_W * this.IMAGE_C]),
                labels: new this.ort.Tensor('int64', labels, [batchSize])
            };
        }
    }

    // Generator function for test batches
    async *testBatches(normalize = true) {
        for (let i = 0; i < this.testData.length; i += this.batchSize) {
            const batchData = this.testData.slice(i, i + this.batchSize);
            const batchSize = batchData.length;

            // Initialize arrays for the batch
            const input = new Float32Array(batchSize * this.IMAGE_H * this.IMAGE_W * this.IMAGE_C);
            const labels = new BigInt64Array(batchSize);

            // Fill the arrays
            batchData.forEach((sample, index) => {
                // Flatten and normalize image data
                const pixels = sample.image;
                for (let j = 0; j < pixels.length; j++) {
                    input[index * (this.IMAGE_H * this.IMAGE_W * this.IMAGE_C) + j] = 
                        normalize ? BloodMNIST.normalize(pixels[j]) : pixels[j];
                }
                labels[index] = BigInt(sample.label);
            });

            // Yield the batch
            yield {
                data: new this.ort.Tensor('float32', input, [batchSize, this.IMAGE_H * this.IMAGE_W * this.IMAGE_C]),
                labels: new this.ort.Tensor('int64', labels, [batchSize])
            };
        }
    }
}