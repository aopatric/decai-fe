# On-Device Training Example with BloodMNIST

## Step 1: Set up environment

Starting from the `decai-fe` directory:

```
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Step 2: Download dataset

```
python ./on_device_training/conversion.py --data_flag 'bloodmnist' --output_dir './on_device_training/web/web-bundler/public/data'
```

## Step 3: Launch Demo

Navigate to ``on_device_training/web/web-bundler``, then:

```
npm ci
npm start
```