from medmnist import BloodMNIST

# Load the dataset
train_dataset = BloodMNIST(split="train", download=True)

# Check the number of samples in the dataset
print(f"Number of training samples: {len(train_dataset)}")
