# peer-tree
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/) [![npm](https://img.shields.io/npm/dt/simple-signal-client.svg)](https://www.npmjs.org/package/simple-signal-client)

**peer-tree** connects an unlimited number of WebRTC peers in a k-tree (like a binary tree, but with k downstream connections instead of just 2). Peers forward data and video streams down to the peers below them. This allows one-to-many broadcast to a huge number of peers with extremely low latency.

## Install

Server:
```
npm install peer-tree-server
```

Client (with Browserify):  
```
npm install peer-tree-client
```

*A standalone client build is available in **dist** as well.*

## Usage

Server:

```javascript
var io = require('socket.io')() // A socket.io instance for signalling
var PeerTreeServer = require('./../src/index')

var treeServer = new PeerTreeServer(io, {
  k: 2 // k is the maximum number of downstream connections per peer,
  k1: 10 // k1 is the maximum number of downstream connections for the source
})
```

Client: 

```javascript
var socket = require('socket.io-client')() // A socket.io-client instance for signalling
var treeClient = new PeerTreeClient(socket)

// If you want to create a new tree (and become the source)
treeClient.create()
treeClient.on('discover', function (treeID) {
   // The tree has been created with the returned ID
   readableStream.pipe(treeClient) // Each treeClient is a Duplex stream
   treeClient.write('hello world')
})

// If you want to connect to an existing tree
treeClient.connect(treeID)
treeClient.on('discover', function (treeID) {
  // Tree exists, but we may not be connected to an upstream peer yet
})
treeClient.on('connect', function (treeID) {
  // Connected to an upstream peer
})
treeClient.pipe(writableStream) // Each treeClient is a Duplex stream
```

## Server API

### `var treeServer = new PeerTreeServer(io, [opts])`

Create a new PeerTreeServer. One server can handle multiple trees simultaneously.

Required `io` is an existing **socket.io** instance.

Default `opts` option object is:
```javascript
{
   k: 4,
   k1: 10
}
``` 

## Client API

### `var treeClient = new PeerTreeClient(io, [opts])`

Create a new PeerTreeClient. Each client can only connect to one tree.

Required `io` is an existing **socket.io-client** instance.

`opts` will be passed to the stream constructor.

### `treeClient.create()`

Create a new tree and become the source.

### `treeClient.on('discover', function (treeID) {})`

Fires when a tree is joined.

`treeID` is the ID of the tree.

### `treeClient.on('connect', function (treeID) {})`

Fires when an upstream peer is connected to. This event never fires for source peers.

`treeID` is the ID of the tree connected to.

### `treeClient.on('stream', function (stream) {})`

Fires when a MediaStream is received from an upstream peer.

`stream` is the MediaStream object received.

### `treeClient.on('disconnect', function () {})`

Fires when the peer disconnects from it's upstream peer. See Notes for methods to handle churn.

### Notes

#### Security Considerations

**peer-tree** does not attempt to validate the data received by upstream peers. Any peer can replace the source data with their own (potentially malicious) data, or withold it altogether. Data should be cryptographically signed by the source and sensitive data should be encrypted or sent through secure channels. Peers that don't forward data should be removed from the tree.

It is very difficult to verify the integrity of a MediaStream object, so their use is discouraged in applications that could potentially have malicious peers.

#### Churn/Peer Drop

Peers won't stay connected forever, and when they do drop, all peers downstream will also be disconnected. peer-tree will automatically reconnect these peers, but it is possible that some data is missed during this reconnection process.

One way to handle this is to create two or more trees with a lower k-value and send the same data along them. This will reduce the chance that a peer is completely disconnected, although it adds some redundant data transfer.

It is always possible that peers in the first few levels of the tree will disconnect, causing a large number of peers to lose connection. To prevent this, set k1 to the highest value possible and use multiple trees.

#### Latency

Although trees suffer from churn problems, they are the ideal architecture for low latency solutions. The number of connections between the source and a newly connecting peer is guaranteed to less than logK(n), where n is the total number of peers and K is the max number of downstream connections. **peer-tree** uses breadth-first order to place peers, but does not attempt to rebalance the tree.

