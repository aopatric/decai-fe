Prerequisites
Node.js (v14 or higher)
npm (Node Package Manager)
Python 3.11 with the following packages:
opencv-python
numpy
pandas
scikit-learn
Setup Instructions
1. Clone the Repository and Navigate to the Project Directory
bash
Copy code
git clone <repository-url>
cd onnxruntime-training-examples/on_device_training/web/web-bundler
2. Install Node.js Dependencies
bash
Copy code
npm install
3. Install Python Dependencies
bash
Copy code
pip install opencv-python numpy pandas scikit-learn
4. Prepare Data
Ensure that your image datasets are located in the appropriate folders (./web/web-bundler/public/datasets/Training/ and ./web/web-bundler/public/datasets/Testing/).

5. Generate Classification Data
Run the generate-classification-data.py script:

bash
Copy code
python generate-classification-data.py
6. Start the Development Server
bash
Copy code
npm run dev
7. Open the Browser
Navigate to http://localhost:9000 to access the training interface.

Notes
The images size are  512x512 pixels and formatted before running the project.
Check the console for any error messages during training or evaluation.