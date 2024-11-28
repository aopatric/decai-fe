# JS-PyTorch BloodMNIST Web Demo

## Usage:

Currently *very* buggy, but run get_data.py to download the bloodMNIST dataset to the correct directory and then run index.html, and you can tweak the parameters as described at the bottom of that file.

I'll make training happen on a separate thread later, but for now it causes the page to hang so to see live updates, open the console *before* data loads.

End-of-epoch logging gives NaNs for now, but will be fixed.