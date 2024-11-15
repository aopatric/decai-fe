# python_client.py
import asyncio
import json
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCDataChannel
import websockets

async def run():
    pc = RTCPeerConnection()
    try:
        # Establish WebSocket connection to the signaling server
        async with websockets.connect("ws://localhost:8765") as signaling:

            # Set up the data channel and message handling
            @pc.on("datachannel")
            def on_datachannel(channel: RTCDataChannel):
                print("Data channel established!")
                channel.on("message", lambda message: print(f"Message from JavaScript: {message}"))
                # Send a message to the JavaScript client when the channel opens
                if channel.readyState == "open":
                    channel.send("Hello from Python!")

            # Handle incoming WebSocket messages
            async for message in signaling:
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

        # Close the peer connection when the WebSocket connection is closed
        await pc.close()

    except websockets.exceptions.ConnectionClosedError as e:
        print(f"Connection closed with error: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")

# Run the Python client within an asyncio event loop
asyncio.run(run())
