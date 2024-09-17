import cv2
import os

# Define the parent directory where images are stored
parent_dir = './datasets/'

# Function to resize images
def resize_images_in_directory(directory, target_size=(512, 512)):
    # Traverse all files in the directory
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(('.png', '.jpg', '.jpeg')):
                img_path = os.path.join(root, file)
                # Read the image
                image = cv2.imread(img_path)
                if image is not None:
                    # Resize the image
                    resized_image = cv2.resize(image, target_size)
                    # Save the resized image back to its path
                    cv2.imwrite(img_path, resized_image)
                    print(f"Resized and saved: {img_path}")
                else:
                    print(f"Failed to read image: {img_path}")

# Run the resizing function for the parent directory
resize_images_in_directory(parent_dir)
