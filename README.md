<!-- @format -->

# python-p2p-aiortc

Just a simple demonstration of using aiortc for a p2p application

## How to run

1. Install the dependencies

```bash
pip install -r requirements.txt
```

2. Run the server

```bash
python server.py
```

3. Run the client

```bash
mpirun -np 20 -H localhost:20 python client.py
```

Note that I am using `mpirun` to simply run multiple clients on the same machine. There is no need to use `mpirun` if you are patient enough to run each client one by one or use some other script.

If the code works fine then it will run 20 clients on the same machine and they will send each other ping-pong messages.
This is currently configured to run on the same machine, but you will have to make minor changes to run it on different machines.
