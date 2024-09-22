import cv2
import os

# Define the parent directory where images are stored
parent_dir = './datasets/'

# Function to resize images and convert to grayscale
def preprocess_images(directory, target_size=(28, 28)):
    # Traverse all files in the directory
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(('.png', '.jpg', '.jpeg')):
                img_path = os.path.join(root, file)
                # Read the image in grayscale mode
                image = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
                if image is not None:
                    # Resize the image
                    resized_image = cv2.resize(image, target_size, interpolation=cv2.INTER_AREA)
                    # Save the resized image back to its path
                    cv2.imwrite(img_path, resized_image)
                    print(f"Resized and saved: {img_path}")
                else:
                    print(f"Failed to read image: {img_path}")

# Run the preprocessing function for the parent directory
preprocess_images(parent_dir)
