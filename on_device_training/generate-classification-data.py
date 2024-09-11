import os
import json
import pandas as pd
from sklearn.model_selection import train_test_split

# Define directories and files
data_dir = './web/web-bundler/public/data/'
image_dir = './web/web-bundler/public/datasets/Testing/'
train_file = 'classification-train.json'
test_file = 'classification-test.json'
val_file = 'classification-validation.json'

# Create the output directory if it doesn't exist
os.makedirs(data_dir, exist_ok=True)

# Prepare a list to hold all image paths and labels
data = []

# Traverse the image directory to gather file paths and labels
for class_name in os.listdir(image_dir):
    class_path = os.path.join(image_dir, class_name)
    if os.path.isdir(class_path):  # Ensure it's a directory
        for img_file in os.listdir(class_path):
            if img_file.endswith(('.png', '.jpg', '.jpeg')):  # Consider only image files
                img_path = os.path.join(class_path, img_file)
                data.append({'image_path': img_path, 'label': class_name})

# Convert to DataFrame
df = pd.DataFrame(data)

# Split the dataset into train, test, and validation sets
train_df, test_df = train_test_split(df, test_size=0.1, random_state=42)
test_df, val_df = train_test_split(test_df, test_size=0.5, random_state=42)

# Function to save DataFrame to JSON with proper formatting
def save_to_json(dataframe, file_path):
    data = []
    for _, row in dataframe.iterrows():
        item = {
            'image_path': row['image_path'],
            'label': row['label']
        }
        data.append(item)
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)  # Added indent=4 for readable JSON format

# Save the datasets to JSON files
save_to_json(train_df, os.path.join(data_dir, train_file))
save_to_json(test_df, os.path.join(data_dir, test_file))
save_to_json(val_df, os.path.join(data_dir, val_file))

print("Data has been successfully prepared and saved!")
