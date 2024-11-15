# python_client.py
import asyncio
import json
import time
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCDataChannel
import websockets
from simple_model import SimpleModel, serialize_weights, deserialize_weights

async def run():
    pc = RTCPeerConnection()
    model = SimpleModel()
    rounds = 5  # Set the number of rounds here
    current_round = 0
    training_complete = False

    try:
        # Establish WebSocket connection to the signaling server
        async with websockets.connect("ws://localhost:8765") as signaling:

            # Set up the data channel and message handling
            @pc.on("datachannel")
            def on_datachannel(channel: RTCDataChannel):
                nonlocal current_round, training_complete
                print("Data channel established!")

                # channel.on("message", lambda message: print(f"Message from JavaScript: {message}"))
                # # Send a message to the JavaScript client when the channel opens
                # if channel.readyState == "open":
                #     channel.send("Hello from Python!")

                async def train_and_send():
                    nonlocal current_round, training_complete

                    # Define a callback to handle incoming messages
                    @channel.on("message")
                    def on_message(message):
                        nonlocal current_round, training_complete
                        data = json.loads(message)
                        if "weights" in data:
                            # Deserialize received weights
                            deserialize_weights(model, data["weights"])
                            print(f"Received updated weights for round {current_round + 1} from JavaScript")
                            current_round += 1

                            # If rounds are not complete, send the next weights
                            if current_round < rounds:
                                print(f"Python training round {current_round + 1}")
                                time.sleep(1)  # Simulate training time
                                weights = serialize_weights(model)
                                channel.send(json.dumps({"weights": weights, "round": current_round}))
                            else:
                                print("Training complete")
                                print("Closing data channel and peer connection from Python")
                                channel.close()
                                asyncio.create_task(pc.close())  # Close peer connection
                                training_complete = True

                    # Start the first round by sending the initial weights
                    print(f"Python training round {current_round + 1}")
                    time.sleep(1)  # Simulate training time
                    weights = serialize_weights(model)
                    channel.send(json.dumps({"weights": weights, "round": current_round}))

                # Start the training and sending process
                asyncio.create_task(train_and_send())

            # Handle incoming WebSocket messages
            async for message in signaling:
                if training_complete:
                    break
                data = json.loads(message)

                # Handle SDP (Session Description Protocol) messages
                if "sdp" in data:
                    sdp_data = data["sdp"]
                    desc = RTCSessionDescription(sdp=sdp_data["sdp"], type=sdp_data["type"])
                    await pc.setRemoteDescription(desc)
                    if desc.type == "offer":
                        answer = await pc.createAnswer()
                        await pc.setLocalDescription(answer)
                        sdp = {
                            "sdp": pc.localDescription.sdp,
                            "type": pc.localDescription.type
                        }
                        await signaling.send(json.dumps({"sdp": sdp}))

                # Handle ICE (Interactive Connectivity Establishment) candidates
                elif "candidate" in data:
                    # Extract the candidate details from the candidate string
                    candidate_str = data["candidate"]["candidate"]
                    candidate_parts = candidate_str.split()

                    # Extract fields based on their positions in the candidate string
                    candidate = RTCIceCandidate(
                        component=int(candidate_parts[1]),  # Typically "1" for RTP
                        foundation=candidate_parts[0].split(":")[1],
                        protocol=candidate_parts[2].lower(),  # Usually "udp" or "tcp"
                        priority=int(candidate_parts[3]),
                        ip=candidate_parts[4],
                        port=int(candidate_parts[5]),
                        type=candidate_parts[7],
                        sdpMid=data["candidate"].get("sdpMid"),
                        sdpMLineIndex=data["candidate"].get("sdpMLineIndex"),
                    )

                    # Add the candidate to the peer connection
                    await pc.addIceCandidate(candidate)

    except websockets.exceptions.ConnectionClosedError as e:
        print(f"Connection closed with error: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")

    finally:
        # Close the peer connection when the WebSocket connection is closed
        await pc.close()

# Run the Python client within an asyncio event loop
asyncio.run(run())
