import torch

# Define a simple model
class SimpleModel(torch.nn.Module):
    def __init__(self):
        super(SimpleModel, self).__init__()
        self.fc = torch.nn.Linear(2, 2)  # Small model with 2 inputs and 2 outputs

    def forward(self, x):
        return self.fc(x)

# Function to serialize model weights
def serialize_weights(model):
    return {k: v.tolist() for k, v in model.state_dict().items()}

# Function to deserialize weights into the model
def deserialize_weights(model, weights):
    state_dict = {k: torch.tensor(v) for k, v in weights.items()}
    model.load_state_dict(state_dict)