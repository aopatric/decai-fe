import { log , argmax, updateStatus } from './utils.js';
import { BloodMNIST } from './bloodmnist.js';

const ort = require("onnxruntime-web/training");

export class TorusNode {
    constructor(signalingServer) {
        this.signalingServer = signalingServer;
        this.connections = new Map();
        this.dataChannels = new Map();
        this.rank = null;
        this.neighbors = null;
        this.connectedPeers = new Set();
        this.pendingConnections = new Set();
        this.expectedConnections = 0;
        this.connectionRetries = new Map();
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 2000;
        this.sessionId = null;

        // data attributes
        this.dataLoader = null;
        this.batchSize = 32;
        this.maxNumTrainSamples = 6400;
        this.maxNumTestSamples = 1280;

        // training attributes
        this.trainingSession = null;
        this.trainingLosses = [];
        this.testAccurracies = [];
        this.lastLogTime = 0;
        this.messagesQueue = [];
        this.logIntervalMs = 1000;
        this.waitAfterLoggingMs = 500;
        this.lossNodeName = "onnx::loss::8";

        log('Initializing TorusNode...');
    }



    /*
    
    Decentralized Communication

    */

    async connect(sessionInfo) {
        try {
            this.ws = new WebSocket(this.signalingServer);
            this.ws.onmessage = this.handleWsMessage.bind(this);
            this.ws.onopen = () => {
                log('Connected to signaling server');
                this.ws.send(JSON.stringify({
                    // type: 'session_action',
                    type: sessionInfo.type,
                    sessionId: sessionInfo.sessionId,
                    maxClients: sessionInfo.maxClients,
                    clientType: 'javascript'
                }));
            };
        } catch (error) {
            log(`WebSocket connection error: ${error}`, 'error');
        }
    }

    async handleWsMessage(event) {
        const data = JSON.parse(event.data);
        log(`Received ${data.type} message`);

        switch (data.type) {
            case 'session_created':
                updateStatus(`Session created. Waiting for ${data.remainingClients} more clients...`);
                this.sessionId = data.sessionId;
                break;
            case 'session_joined':
                updateStatus(`Joined session. Waiting for ${data.remainingClients} more clients...`);
                this.sessionId = data.sessionId;
                break;
            case 'session_ready':
                updateStatus('Session ready! Establishing connections...');
                break;
            case 'session_error':
                updateStatus(`Session Error: ${data.message}`);
                log(data.message, 'error');
                break;
            case 'topology':
                await this.handleTopology(data);
                break;
            case 'signal':
                await this.handleSignaling(data);
                break;
            case 'network_ready':
                updateStatus('Network Ready');
                break;
        }
    }

    async handleTopology(data) {
        this.rank = data.rank;
        const newNeighbors = data.neighbors;
        log(`Received topology. Rank: ${this.rank}, Neighbors: ${JSON.stringify(newNeighbors)}`);

        if (this.neighbors) {
            const oldNeighbors = new Set(Object.values(this.neighbors));
            const newNeighborSet = new Set(Object.values(newNeighbors));
            for (const rank of oldNeighbors) {
                if (!newNeighborSet.has(rank)) {
                    await this.cleanupConnection(rank);
                }
            }
        }

        this.neighbors = newNeighbors;
        this.expectedConnections = Object.keys(newNeighbors).length;
        updateStatus(`Connected (Rank ${this.rank})`);

        // Initiate connections to higher-ranked neighbors
        for (const neighborRank of Object.values(newNeighbors)) {
            if (neighborRank > this.rank && 
                !this.connections.has(neighborRank) && 
                !this.pendingConnections.has(neighborRank)) {
                log(`Initiating connection to ${neighborRank}`);
                this.pendingConnections.add(neighborRank);
                this.initiateConnection(neighborRank);
            }
        }
    }

    createPeerConnection() {
        const config = {
            iceServers: [{
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302'
                ]
            }]
        };

        const pc = new RTCPeerConnection(config);
        
        pc.oniceconnectionstatechange = () => {
            log(`ICE connection state: ${pc.iceConnectionState}`);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                log('ICE candidate generated');
            }
        };

        return pc;
    }

    async initiateConnection(targetRank) {
        try {
            const pc = this.createPeerConnection();
            this.connections.set(targetRank, pc);

            // Create data channel
            const channel = pc.createDataChannel(`chat-${this.rank}-${targetRank}`);
            this.setupDataChannel(channel, targetRank);

            // Create and set local description
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Wait for ICE gathering
            await new Promise(resolve => {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkState, 1000);
                    }
                };
                checkState();
            });

            // Send offer
            await this.sendSignaling(targetRank, {
                type: 'offer',
                sdp: pc.localDescription.sdp
            });

        } catch (error) {
            log(`Failed to initiate connection to ${targetRank}: ${error}`, 'error');
            await this.handleConnectionFailure(targetRank);
        }
    }

    setupDataChannel(channel, peerRank) {
        this.dataChannels.set(peerRank, channel);

        channel.onopen = () => {
            log(`Data channel opened with peer ${peerRank}`);
            this.onPeerConnected(peerRank);
            this.startFederatedTrainingLoop(peerRank);
        };

        channel.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "weights") {
                    log(`Received weights from peer ${peerRank} with loss: ${data.loss}`);
                    await this.importWeights(data.weights);
                    log("Successfully merged received weights");
                }
            } catch (error) {
                log(`Error handling message from peer ${peerRank}: ${error}`, 'error');
            }
        };

        channel.onclose = () => {
            log(`Data channel with peer ${peerRank} closed`);
            if (this.trainingInterval) {
                clearInterval(this.trainingInterval);
            }
        };
    }

    /* Old Pinging Loop, Replace this w/ Training Loop
    startPingLoop(peerRank) {
        const sendPing = () => {
            const channel = this.dataChannels.get(peerRank);
            if (channel && channel.readyState === 'open') {
                channel.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            }
        };

        setInterval(sendPing, 5000);
    }
    */

    // open dataloader
    async initializeDataLoader() {
        try {
            this.dataLoader = new BloodMNIST(
                this.ort,
                this.batchSize,
                this.maxNumTrainSamples,
                this.maxNumTestSamples
            );
            
            // Load the split JSON files
            await this.dataLoader.loadData();
            log('Data loader initialized successfully');
        } catch (error) {
            log(`Error initializing data loader: ${error}`, 'error');
            throw error;
        }
    }

    async startFederatedTrainingLoop(peerRank) {
        try {


            if (!this.trainingSession) {
                await this.loadTrainingSession();
            }

            // Initialize data loader if not already initialized
            if (!this.dataLoader) {
                this.initializeDataLoader()
            }

            const trainAndSend = async () => {
                try {
                    // Run one training epoch
                    log("Starting local training epoch...");
                    
                    // Run training epoch (assuming 1 epoch per interval)
                    const currentEpoch = 0; // Since we're doing one epoch at a time
                    const numEpochs = 1;
                    const iterationsPerSecond = await this.runTrainingEpoch(
                        this.dataLoader,
                        currentEpoch,
                        numEpochs
                    );

                    // Get the latest loss (last element in trainingLosses array)
                    const latestLoss = this.trainingLosses[this.trainingLosses.length - 1];
                    log(`Training epoch completed with loss: ${latestLoss} at ${iterationsPerSecond.toFixed(2)} it/s`);

                    // Run testing epoch to get accuracy
                    const accuracy = await this.runTestingEpoch(
                        this.dataLoader,
                        currentEpoch,
                        numEpochs
                    );
                    log(`Testing completed with accuracy: ${(accuracy * 100).toFixed(2)}%`);

                    // Export and send weights to peer
                    log(`Sending updated weights to peer ${peerRank}...`);
                    const weights = await this.exportWeights();
                    const channel = this.dataChannels.get(peerRank);
                    
                    if (channel && channel.readyState === "open") {
                        channel.send(JSON.stringify({
                            type: "weights",
                            weights: weights,
                            loss: latestLoss,
                            accuracy: accuracy,
                            iterationsPerSecond: iterationsPerSecond,
                            timestamp: Date.now()
                        }));
                        log(`Weights sent to peer ${peerRank}`);
                    }
                } catch (error) {
                    log(`Error in training loop: ${error}`, 'error');
                }
            };

            // Clear any existing interval
            if (this.trainingInterval) {
                clearInterval(this.trainingInterval);
            }

            // Run training loop every 30 seconds
            this.trainingInterval = setInterval(trainAndSend, 30000);
            
            // Run initial training immediately
            log(`Starting initial training cycle with peer ${peerRank}...`);
            await trainAndSend();
            
        } catch (error) {
            log(`Error starting federated training loop: ${error}`, 'error');
            // Clean up interval if there's an error
            if (this.trainingInterval) {
                clearInterval(this.trainingInterval);
                this.trainingInterval = null;
            }
        }
    }

    async handleSignaling(message) {
        const senderRank = message.senderRank;
        const data = message.data;

        try {
            let pc = this.connections.get(senderRank);
            if (!pc) {
                pc = this.createPeerConnection();
                this.connections.set(senderRank, pc);

                pc.ondatachannel = (event) => {
                    this.setupDataChannel(event.channel, senderRank);
                };
            }

            if (data.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'offer',
                    sdp: data.sdp
                }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await this.sendSignaling(senderRank, {
                    type: 'answer',
                    sdp: answer.sdp,
                });
            } else if (data.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: data.sdp
                }));
            } else if (data.type === 'candidate') {
                await pc.addIceCandidate({
                    candidate: data.candidate,
                    sdpMLineIndex: 0,
                    sdpMid: '0'
                });
            }
        } catch (error) {
            log(`Error handling signaling message: ${error}`, 'error');
        }
    }

    async sendSignaling(targetRank, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            await this.ws.send(JSON.stringify({
                type: 'signal',
                targetRank: targetRank,
                data: data,
                sessionId: this.sessionId
            }));
        }
    }

    onPeerConnected(peerRank) {
        this.connectedPeers.add(peerRank);
        this.pendingConnections.delete(peerRank);
        log(`Connected to peer ${peerRank}. Connected: ${this.connectedPeers.size}/${this.expectedConnections}`);

        this.ws.send(JSON.stringify({
            type: 'connection_established',
            peerRank: peerRank,
            sessionId: this.sessionId
        }));
    }

    async handleConnectionFailure(targetRank) {
        const retryCount = this.connectionRetries.get(targetRank) || 0;
        if (retryCount < this.MAX_RETRIES) {
            this.connectionRetries.set(targetRank, retryCount + 1);
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * (retryCount + 1)));
            if (!this.connectedPeers.has(targetRank)) {
                await this.cleanupConnection(targetRank);
                this.initiateConnection(targetRank);
            }
        } else {
            log(`Max retries reached for ${targetRank}`, 'error');
            await this.cleanupConnection(targetRank);
        }
    }

    async cleanupConnection(rank) {
        try {
            const pc = this.connections.get(rank);
            if (pc) {
                const channel = this.dataChannels.get(rank);
                if (channel) {
                    channel.close();
                    this.dataChannels.delete(rank);
                }
                pc.close();
                this.connections.delete(rank);
            }

            this.pendingConnections.delete(rank);
            this.connectedPeers.delete(rank);
            log(`Cleaned up connection to peer ${rank}`);
        } catch (error) {
            log(`Error during connection cleanup for peer ${rank}: ${error}`, 'error');
        }
    }

    /*

    Begin Training Methods

    */
    
    // this is updated
    async loadTrainingSession() {
        try{
            const artifact_path = "../public/training_artifacts/"
            const ckptPath = artifact_path + "checkpoint"
            const trainingModelPath = artifact_path + "training_model.onnx"
            const evalPath = artifact_path + "eval_model.onnx"
            const optimizerPath = artifact_path + "optimizer_model.onnx"

            const createOptions = {
                backendHint: "webgl"
            };

            // create the training session and attach it to this instance
            this.trainingSession = await ort.TrainingSession.create(ckptPath, optimizerPath, createOptions);
            log("Successfully loaded training session.");
            return this.trainingSession;
        } catch (error) {
            log(`Error loading training session: ${error}`, "error");
            throw error;
        }
    }

    // run a single epoch on the given data
    async runTrainingEpoch(dataSet, epoch, numEpochs) {
        let batchNum = 0;
        let totalNumBatches = dataSet.getNumTrainingBatches();
        const epochStartTime = Date.now();
        let iterationsPerSecond = 0;

        await log(`Epoch ${String(epoch + 1).padStart(2)} / ${numEpochs} starting...`)

        for await (const batch of dataSet.trainingBatches()) {
            ++batchNum;

            const feeds = {
                input: batch.data,
                labels: batch.labels
            };

            const results = await this.trainingSession.runTrainStep(feeds);

            const loss = parseFloat(results[this.lossNodeName].data);
            this.trainingLosses.push(loss);

            iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);

            const message = `Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(batchNum).padStart(3)} / ${totalNumBatches} | Loss: ${loss.toFixed(4)} | ${iterationsPerSecond.toFixed(2)} it/s`;
            log(message);

            await this.trainingSession.runOptimizerStep();
            await this.trainingSession.lazyResetGrad();
        }

        return iterationsPerSecond;
    }

    // run a single TESTING epoch on the given data
    async runTestingEpoch(dataSet, epoch, numEpochs) {
        let batchNum = 0;
        let totalNumBatches = dataSet.getNumTestBatches();
        let numCorrect = 0;
        let testPicsSoFar = 0;
        let accumulatedLoss = 0;
        const epochStartTime = Date.now();

        await this.logMessage(`TESTING | Epoch: ${String(epoch + 1).padStart(2)} / ${numEpochs} | Starting testing...`);

        for await (const batch of dataSet.testBatches()) {
            ++batchNum;

            const feeds = {
                input: batch.data,
                labels: batch.labels
            };

            // Run evaluation step
            const results = await this.trainingSession.runEvalStep(feeds);

            // Update metrics
            const loss = parseFloat(results[this.lossNodeName].data);
            accumulatedLoss += loss;
            testPicsSoFar += batch.data.dims[0];
            numCorrect += this.countCorrectPredictions(results['output'], batch.labels);
            
            const iterationsPerSecond = batchNum / ((Date.now() - epochStartTime) / 1000);
            const message = `TESTING | Epoch: ${String(epoch + 1).padStart(2)} | Batch ${String(batchNum).padStart(3)} / ${totalNumBatches} | Average test loss: ${(accumulatedLoss / batchNum).toFixed(2)} | Accuracy: ${numCorrect}/${testPicsSoFar} (${(100 * numCorrect / testPicsSoFar).toFixed(2)}%) | ${iterationsPerSecond.toFixed(2)} it/s`;
            log(message);
        }

        const avgAcc = numCorrect / testPicsSoFar;
        this.testAccuracies.push(avgAcc);
        return avgAcc;
    }

    getPredictions(results) {
        const predictions = [];
        const [batchSize, numClasses] = results.dims;
        
        for (let i = 0; i < batchSize; ++i) {
            const probabilities = results.data.slice(i * numClasses, (i + 1) * numClasses);
            const resultsLabel = argmax(probabilities);
            predictions.push(resultsLabel);
        }
        return predictions;
    }

    countCorrectPredictions(output, labels) {
        let result = 0;
        const predictions = this.getPredictions(output);
        for (let i = 0; i < predictions.length; ++i) {
            if (BigInt(predictions[i]) === labels.data[i]) {
                ++result;
            }
        }
        return result;
    }

    // loads ONNX model (old)
    async loadDummyModel() {
        log("Creating a dummy ONNX model...");
        this.model = {
            weights: [Math.random(), Math.random()], // get random dummy weights

            // define training function (adds random noise for now)
            train: function () {
                log("Training dummy ONNX model...");
                this.weights = this.weights.map((w) => w + Math.random());
            },
            
            // getter for the model weights
            getWeights: function () {
                return this.weights;
            },
        };
        log("Dummy ONNX model created.");
    }

    // Weight export/import functions
    async exportWeights() {
        try {
            const parameters = await this.trainingSession.getNamedParameters();
            const exportedWeights = {};
            for (const [name, tensor] of parameters) {
                exportedWeights[name] = {
                    data: Array.from(tensor.data),
                    dims: tensor.dims,
                    type: tensor.type
                };
            }
            return exportedWeights;
        } catch (error) {
            log(`Error exporting weights: ${error}`, 'error');
            throw error;
        }
    }

    async importWeights(receivedWeights) {
        try {
            const parameters = new Map();
            for (const [name, weightData] of Object.entries(receivedWeights)) {
                parameters.set(name, new this.ort.Tensor(
                    weightData.type,
                    weightData.data,
                    weightData.dims
                ));
            }
            await this.trainingSession.setNamedParameters(parameters);
            log("Successfully imported and updated weights");
        } catch (error) {
            log(`Error importing weights: ${error}`, 'error');
            throw error;
        }
    }

    // helper for sending the weights across peer datachannel (old)
    sendWeights = (peerRank) => {
        const channel = this.dataChannels.get(peerRank);

        if (channel && channel.readyState === "open") {
            // send our weights to the peer
            channel.send(JSON.stringify({
                type: "weights",
                weights: this.exportWeights(),
                timestamp: Date.now(),
            }));
        }
    }
}
