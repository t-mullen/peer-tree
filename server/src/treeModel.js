// Peers connect to each other in a k-tree with an indegree of 1 and outdegree of k
// k1 is the initial outdegree for the broadcaster
function TreeModel (k, k1) {
  var self = this
  if (!(self instanceof TreeModel)) return new TreeModel(k)

  var broadcasterID
  var graph = {}

    // Setup/reset the tree
  function init () {
    graph = {}
    graph[broadcasterID] = {
      id: broadcasterID,
      children: []
    }
  }

    // Breadth-first search (returns id of closest-to-source available node)
  function BFS () {
    var queue
    var current
    var isBroadcaster = true

    queue = [broadcasterID]

    while (queue.length > 0) {
      current = graph[queue.shift()]
      if (current.children.length < k || (isBroadcaster && current.children.length < k1)) {
        return current.id
      }
      isBroadcaster = false

      for (var i = 0; i < current.children.length; i++) {
        queue.push(current.children[i])
      }
    }
    return broadcasterID
  }

  self.getGraph = function () {
    return graph
  }

    // Sets the peer with the given ID as the source
  self.setBroadcaster = function addPeer (id) {
    broadcasterID = id
    init()
  }

    // Adds a peer to the model returns the ids of peers it should connect to
  self.addPeer = function addPeer (id) {
    if (!broadcasterID) {
      return []
    }
    var parentID = BFS()
    graph[id] = {
      id: id,
      children: [],
      parent: parentID
    }
    graph[parentID].children.push(id)
    return [parentID]
  }

  // Removes a peer from the model, returning the ids of peers that must reconnect
  self.removePeer = function removePeer (id) {
    if (!broadcasterID) {
      return []
    }
    var result = []

    function disconnect (id) {
      if (!graph[id]) return
      while (graph[id].children[0]) {
        result.push(graph[id].children[0])
        disconnect(graph[id].children[0])
      }
      if (!graph[graph[id].parent]) return [] // peers are already reconnectings
      var index = graph[graph[id].parent].children.indexOf(id)
      graph[graph[id].parent].children.splice(index, 1)
      delete graph[id]
    }

    disconnect(id)
    return result
  }
}

module.exports = TreeModel
