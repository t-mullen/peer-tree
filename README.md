# peer-tree
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

**peer-tree** connects an unlimited number of WebRTC peers in a k-tree (like a binary tree, but with k downstream connections instead of just 2). Peers can forward data and video streams down to the peers below them. This allows one-to-many broadcast to a huge number of peers with extremely low latency.

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
var PeerTreeServer = require('peer-tree-server')

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
treeClient.on('discover', (treeID) => {
  // The tree has been created with the returned ID
  treeClient.write('hello world')
})
treeClient.on('downstreamPeer', (peer) => {
  // pipe our data to every downstream peer
  readableStream.pipe(peer)
})

// If you want to connect to an existing tree
treeClient.connect(treeID)
treeClient.on('discover', function (treeID) {
  // Tree exists, but we may not be connected to an upstream peer yet
})
treeClient.on('upstreamPeer', (peer) => {
  peer.pipe(writableStream) // this is our stream data
})
treeClient.on('downstreamPeer', (peer) => {
  readableStream.pipe(peer) // either replicate the upstream content, or pipe else
})
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

`opts` will be passed to the `simple-peer` constructor.

`opts.timeout` is the time in milliseconds to wait for a peer to connect. Default is `10000`.

### `treeClient.create()`

Create a new tree and become the source.

### `treeClient.reconnectUpstream()`

Disconnect from the current upstream peer and request a new one from the server.

### `treeClient.on('discover', (treeID) => {})`

Fires when a tree is joined.

`treeID` is the ID of the tree. Share this with other peer so they can join.

### `treeClient.on('upstreamPeer', (peer) => {})`

Fires when an upstream peer is connected to. This event never fires if this client is the source.

`peer` is a signalled `simple-peer` instance.

### `treeClient.on('downstreamPeer', (peer) => {})`

Fires when a downstream peer is connected to.

`peer` is a signalled `simple-peer` instance.

### `treeClient.on('disconnect', function () {})`

Fires when the peer disconnects from it's upstream peer. It will automatically attempt to reconnect. See Notes for methods to handle churn.

### Notes

#### Security Considerations

**peer-tree** does not attempt to validate data from upstream peers (they can provide any data stream). Data should be cryptographically signed by the source and sensitive data should be encrypted or sent through secure channels. Peers that don't forward data should be removed from the tree by your application. A signed append-only log is recommended!

It is very difficult to verify the integrity of MediaStream objects, so their use is discouraged in applications that could potentially have malicious peers.

#### Churn/Peer Drop

Peers won't stay connected forever, and when they do drop, their immediate downstream peers will try to reconnect. peer-tree will automatically reconnect these peers, but it is possible that some data is missed during this reconnection process. Your replication process should consider that new downstream peers only have partial data.

One way to mitigate this is to create two or more trees with a lower k-value and send the same data along them. This will reduce the chance that a peer is completely disconnected, although it adds some redundant data transfer.

It is always possible that peers in the first few levels of the tree will disconnect, causing a large number of peers to lose connection. To prevent this, set k1 to the highest value your source peer can handle and use multiple trees.

#### Latency

Although trees suffer from churn problems, they are the ideal architecture for low latency solutions. The number of connections between the source and a newly connecting peer is guaranteed to less than logK(n), where n is the total number of peers and K is the max number of downstream connections. **peer-tree** uses breadth-first order to place peers, but does not attempt to rebalance the tree.

