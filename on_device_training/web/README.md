ONNX Runtime Web On-Device Training Demo
This project demonstrates on-device training using ONNX Runtime Web for a simple image classification model on the MNIST dataset. The application trains a model directly in the browser using WebAssembly and displays training progress and results in real-time. It requires minimal dependencies and can be set up and run with a few simple steps.

Prerequisites
Node.js (v14 or higher)
npm (Node Package Manager)
Python 3.11 with the following packages:
numpy
pandas
scikit-learn
Setup Instructions
1. Clone the Repository and Navigate to the Project Directory
cd onnxruntime-training-examples/on_device_training/web/web-bundler

2. Install Node.js Dependencies
npm install

3. Install Python Dependencies
pip install numpy pandas scikit-learn

4. Download and Prepare the MNIST Dataset
Download the Dataset
Use the following commands to download the MNIST dataset in JSON format:
curl -LO https://github.com/lorenmh/mnist_handwritten_json/raw/master/mnist_handwritten_train.json.gz
curl -LO https://github.com/lorenmh/mnist_handwritten_json/raw/master/mnist_handwritten_test.json.gz
Decompress the Files
Unzip the downloaded files:
gunzip *.gz
Place the Files in the Project Directory
Create the public/data directory if it doesn't exist, and move the JSON files there:
mkdir -p public/data
mv mnist_handwritten_train.json public/data/
mv mnist_handwritten_test.json public/data/

5. Start the Development Server
npm start

6. Open the Browser
Navigate to http://localhost:8080 to access the training interface.

Notes
Image Size: The MNIST images are 28x28 pixels in grayscale.
Data Preparation: The MNIST dataset is now ready for use after downloading and unzipping.
Troubleshooting: Check the console for any error messages during training or evaluation.

Credits:
Microsoft / onnxruntime-training-examples  -- for creating the on-device-training-web
lorenmh minst_handwritten_json -- for the dataset to train the on-device-training-web

