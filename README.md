# Node-Pepper

Node-Pepper brings some spicy mods to Node-RED:
http://nodered.org

# General 

In general what we are trying to do is create mods of the Node module (called Node.js, not to be confused with the JS environment Node-RED runs on!). These mods then apply to all nodes that have been created with node-RED. 

So put your spice everywhere!

# Work in progress

Right now all I have implemented is one mod (see below.) I'm pretty proud of it though, I think with a few more mods we could learn how to mod in a modular way. This would involve a hook for extending the Node.js file as well as extending the editor interface with the additional options. These hooks should be as minimal as possible so updating node-pepper with node-red updates should be as little work as possible.

# Promises

This mod allows you to send a promise from the node rather than a normal msg. The msg.payload is the promise and it resolves on node.send. The benefit of this is that instead of waiting for long-running nodes you can begin the call and continue with your flow and then check your promise later down the line.

see examples/promises.json

# Todos wishlists and hype more or less in that order

Imagine being able to set your own custom loggers for every node at once or just a few.

Imagine nodes having their own set of flow controls -- reducing the amount nodes needed. Imagine having a way to finally do parallel calls or flow branches without complexity.

Imagine being able to use your own favourite editor like vim in the function editor. Imagine being able to click a button to export the function node into a custom node. Or to import a module as an editable function node. 

Imagine that instead of having to put nodes in subflows to reuse them elsewhere you also had the option of "channels" -- colour coded links from one node to another that can cross paths with other links without causing additional msgs on those other links.

Imagine a richer editor experience that allows graphs and other UI elements within the node, such as with meemoo.org

Imagine that nodes learned where to send their messages to -- a cognitive node-red. Nodes further down the flow could feedback the usefulness of the message, updating the nodes neural net.



