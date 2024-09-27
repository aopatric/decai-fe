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
4. Start the Development Server
npm start
6. Open the Browser
Navigate to http://localhost:8080 to access the training interface.

Notes
Image Size: The MNIST images are 28x28 pixels in grayscale.
Data Preparation: No additional data preparation is required since the MNIST dataset is already formatted for use.
Troubleshooting: Check the console for any error messages during training or evaluation.
Short Summary
This project demonstrates on-device training using ONNX Runtime Web with the MNIST dataset, allowing you to train a neural network model directly in your browser. It requires Node.js, npm, and Python with a few packages, and can be set up quickly by cloning the repository, installing dependencies, and starting the development server. The application provides a user interface to monitor training progress and visualize results in real-time.






