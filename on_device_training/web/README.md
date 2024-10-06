ONNX Runtime Web On-Device Training Demo
This project demonstrates on-device training using ONNX Runtime Web for a simple image classification model using the BloodMNIST dataset. The application trains a model directly in the browser using WebAssembly and displays training progress and results in real-time.

Prerequisites
Node.js (v14 or higher)
npm (Node Package Manager)
Python 3.11 with the following packages:
medmnist
numpy
pandas
tqdm
Setup Instructions
1. Clone the Repository and Navigate to the Project Directory
cd on-device-training-classification-model/on_device_training/web/web-bundler
2. Install Node.js Dependencies

3. Install Python Dependencies

pip install medmnist numpy pandas tqdm
4. Prepare the Dataset
Download the BloodMNIST dataset using the following command:
python -m medmnist download --flag=bloodmnist --size=28

Convert the dataset to JSON format by running the conversion script:
python convert_bloodmnist_to_json.py --data_flag=bloodmnist --output_dir=public/data

5. Start the Development Server
npm start

6. Open the Browser
Navigate to http://localhost:8080 to access the training interface.

Notes
Image Size: The BloodMNIST images are 28x28 pixels in grayscale.
Data Preparation: The BloodMNIST dataset is automatically downloaded and converted to JSON format.
Troubleshooting: Check the console for any error messages during training or evaluation.

Credits:
Microsoft / onnxruntime-training-examples  -- for creating the on-device-training-web
Jiancheng Yang, Rui Shi, Donglai Wei, Zequan Liu, Lin Zhao, Bilian Ke, Hanspeter Pfister, Bingbing Ni. Yang, Jiancheng, et al. "MedMNIST v2-A large-scale lightweight benchmark for 2D and 3D biomedical image classification." Scientific Data, 2023.
                            
Jiancheng Yang, Rui Shi, Bingbing Ni. "MedMNIST Classification Decathlon: A Lightweight AutoML Benchmark for Medical Image Analysis". IEEE 18th International Symposium on Biomedical Imaging (ISBI), 2021.