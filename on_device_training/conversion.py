import medmnist
import numpy as np
import json
import os
from tqdm import tqdm

def convert_medmnist_to_json(data_flag: str, output_dir: str):
    """
    Converts MedMNIST dataset to JSON files.

    Parameters:
    - data_flag (str): The dataset flag (e.g., 'bloodmnist').
    - output_dir (str): The directory where JSON files will be saved.

    Outputs:
    - Saves two JSON files: '<data_flag>_train.json' and '<data_flag>_test.json' in the output_dir.
    """
    # Ensure the output directory exists
    os.makedirs(output_dir, exist_ok=True)

    # Load the dataset
    info = medmnist.INFO[data_flag]
    DataClass = getattr(medmnist, info['python_class'])
    
    # Load training and test datasets
    train_dataset = DataClass(split='train', download=True, as_rgb=False)
    test_dataset = DataClass(split='test', download=True, as_rgb=False)

    def process_and_save(dataset, split):
        samples = []
        print(f"Processing {split} data...")

        for idx in tqdm(range(len(dataset)), desc=f"Processing {split} samples"):
            # Get image and label
            image, label = dataset[idx]

            # Convert image to numpy array and flatten it
            img_array = np.array(image).flatten().tolist()

            # Append the flattened image and label to samples
            samples.append({
                'image': img_array,
                'label': int(label)
            })

        # Save to JSON
        output_file = os.path.join(output_dir, f"{data_flag}_{split}.json")
        with open(output_file, 'w') as f:
            json.dump(samples, f)
        print(f"Saved {split} data to {output_file}")

    # Process and save both train and test datasets
    process_and_save(train_dataset, 'train')
    process_and_save(test_dataset, 'test')

    print("Conversion completed successfully.")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Convert MedMNIST dataset to JSON.")
    parser.add_argument('--data_flag', type=str, required=True, help="Dataset flag (e.g., 'bloodmnist').")
    parser.add_argument('--output_dir', type=str, default='data', help="Directory to save JSON files.")
    
    args = parser.parse_args()
    convert_medmnist_to_json(args.data_flag, args.output_dir)
