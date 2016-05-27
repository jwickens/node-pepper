/**
 * Copyright 2014, 2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var util = require("util");
var EventEmitter = require("events").EventEmitter;
var when = require("when");
// node-{epper require poll
var poll = require('when/poll');
// end node-Pepper

var redUtil = require("../util");
var Log = require("../log");
var context = require("./context");
var flows = require("./flows");

function Node(n) {
    // node-Pepper sendPromise config and promiseResolvers array
    this.sendPromise = n.sendPromise;
    this.promiseResolvers = {};
    // end node-Pepper
    this.id = n.id;
    this.type = n.type;
    this.z = n.z;
    this._closeCallbacks = [];

    if (n.name) {
        this.name = n.name;
    }
    if (n._alias) {
        this._alias = n._alias;
    }
    this.updateWires(n.wires);
}

util.inherits(Node, EventEmitter);

Node.prototype.updateWires = function(wires) {
    //console.log("UPDATE",this.id);
    this.wires = wires || [];
    delete this._wire;

    var wc = 0;
    this.wires.forEach(function(w) {
        wc+=w.length;
    });
    this._wireCount = wc;
    if (wc === 0) {
        // With nothing wired to the node, no-op send
        this.send = function(msg) {}
    } else {
        this.send = Node.prototype.send;
        if (this.wires.length === 1 && this.wires[0].length === 1) {
            // Single wire, so we can shortcut the send when
            // a single message is sent
            this._wire = this.wires[0][0];
        }
    }

}
Node.prototype.context = function() {
    if (!this._context) {
         this._context = context.get(this._alias||this.id,this.z);
    }
    return this._context;
}

Node.prototype._on = Node.prototype.on;

Node.prototype.on = function(event, callback) {
    var node = this;
    if (event == "close") {
        this._closeCallbacks.push(callback);
    } else {
        this._on(event, callback);
    }
};

Node.prototype.close = function() {
    var promises = [];
    var node = this;
    for (var i=0;i<this._closeCallbacks.length;i++) {
        var callback = this._closeCallbacks[i];
        if (callback.length == 1) {
            promises.push(
                when.promise(function(resolve) {
                    callback.call(node, function() {
                        resolve();
                    });
                })
            );
        } else {
            callback.call(node);
        }
    }
    if (promises.length > 0) {
        return when.settle(promises);
    } else {
        return;
    }
};

// node-Pepper rename send to sendSync and create a new send that checks for sendPromise

Node.prototype.send = function(msg) {
   var node = this;
   if (node.sendPromise) {
	var msgid;
   	if (! util.isArray(msg)) {
		msg = [msg];
	}
	msg.some(function(m) { 
		if (m._msgid) {
			msgid = m._msgid;
			return true;
		}
	});
	//node.warn("msg " + msgid + " inside of Node.send: " + JSON.stringify(msg));
	//node.warn("msg resolver inside of Node.send: " + JSON.stringify(node.promiseResolvers[msgid]));
	node.promiseResolvers[msgid].forEach(function(resolver, i) {
		//node.warn("resolving output " + i);
		if (msg[i]) {
			resolver.resolve(msg[i].payload);
		} else {
			resolver.reject("null output");
		}
	});
	delete node.promiseResolvers[msgid];
   } else {
       this.sendSync(msg);
   }
};

// node-Pepper end

Node.prototype.sendSync = function(msg) {
    var msgSent = false;
    var node;

    if (msg === null || typeof msg === "undefined") {
        return;
    } else if (!util.isArray(msg)) {
        if (this._wire) {
            // A single message and a single wire on output 0
            // TODO: pre-load flows.get calls - cannot do in constructor
            //       as not all nodes are defined at that point
            if (!msg._msgid) {
                msg._msgid = redUtil.generateId();
            }
            this.metric("send",msg);
            node = flows.get(this._wire);
            /* istanbul ignore else */
            if (node) {
                node.receive(msg);
            }
            return;
        } else {
            msg = [msg];
        }
    }

    var numOutputs = this.wires.length;

    // Build a list of send events so that all cloning is done before
    // any calls to node.receive
    var sendEvents = [];

    var sentMessageId = null;

    // for each output of node eg. [msgs to output 0, msgs to output 1, ...]
    for (var i = 0; i < numOutputs; i++) {
        var wires = this.wires[i]; // wires leaving output i
        /* istanbul ignore else */
        if (i < msg.length) {
            var msgs = msg[i]; // msgs going to output i
            if (msgs !== null && typeof msgs !== "undefined") {
                if (!util.isArray(msgs)) {
                    msgs = [msgs];
                }
                var k = 0;
                // for each recipent node of that output
                for (var j = 0; j < wires.length; j++) {
                    node = flows.get(wires[j]); // node at end of wire j
                    if (node) {
                        // for each msg to send eg. [[m1, m2, ...], ...]
                        for (k = 0; k < msgs.length; k++) {
                            var m = msgs[k];
                            /* istanbul ignore else */
                            if (!sentMessageId) {
                                sentMessageId = m._msgid;
                            }
                            if (msgSent) {
                                var clonedmsg = redUtil.cloneMessage(m);
				// node-Pepper can't clone the promise....
				if (m.payload && m.payload.then) {
					clonedmsg.payload = m.payload;
				}
				// end node-Pepper
                                sendEvents.push({n:node,m:clonedmsg});
                            } else {
                                sendEvents.push({n:node,m:m});
                                msgSent = true;
                            }
                        }
                    }
                }
            }
        }
    }
    /* istanbul ignore else */
    if (!sentMessageId) {
        sentMessageId = redUtil.generateId();
    }
    this.metric("send",{_msgid:sentMessageId});

    for (i=0;i<sendEvents.length;i++) {
        var ev = sendEvents[i];
        /* istanbul ignore else */
        if (!ev.m._msgid) {
            ev.m._msgid = sentMessageId;
        }
        ev.n.receive(ev.m);
    }
};

Node.prototype.receive = function(msg) {
    var node = this
    if (!msg) {
        msg = {};
    }
    if (!msg._msgid) {
        msg._msgid = redUtil.generateId();
    }
    this.metric("receive",msg);

    // node-Pepper check to see if this node is set to sendPromise  and then create a promise
    if (node.sendPromise) {
	var promiseResolvers = [];
	var m = [];
	node.wires.forEach(function() {
		var promise = when.promise(function(resolve, reject) {
			promiseResolvers.push({resolve: resolve, reject: reject});
		});
		var clonedmsg = redUtil.cloneMessage(msg);
		clonedmsg.payload = promise;
		m.push(clonedmsg);
	});
	node.promiseResolvers[msg._msgid] = promiseResolvers; 
        node.sendSync(m)
    }
    // end node-Pepper
    try {
        this.emit("input", msg);
    } catch(err) {
        // node-Pepper check to see if this node is set to sendPromise and then resolve with error
		// todo
	// end node-Pepper ignore closing bracket
        	this.error(err,msg);
	//}
    }
};



function log_helper(self, level, msg) {
    var o = {
        level: level,
        id: self.id,
        type: self.type,
        msg: msg
    };
    if (self.name) {
        o.name = self.name;
    }
    Log.log(o);
}

Node.prototype.log = function(msg) {
    log_helper(this, Log.INFO, msg);
};

Node.prototype.warn = function(msg) {
    log_helper(this, Log.WARN, msg);
};

Node.prototype.error = function(logMessage,msg) {
    logMessage = logMessage || "";
    /*/ node-Pepper if we error we resolve the promise //
    var node = this;
    if (node.sendPromise) {
    	node.promiseResolvers[msg._msgid].error(logMessage);
    	delete node.promiseResolvers[msg._msgid];
    } else {
    // end node-Pepper ignore closing bracket /*/
       log_helper(this, Log.ERROR, logMessage);
    //}
    /* istanbul ignore else */
    if (msg) {
        flows.handleError(this,logMessage,msg);
    }
};

/**
 * If called with no args, returns whether metric collection is enabled
 */
Node.prototype.metric = function(eventname, msg, metricValue) {
    if (typeof eventname === "undefined") {
        return Log.metric();
    }
    var metrics = {};
    metrics.level = Log.METRIC;
    metrics.nodeid = this.id;
    metrics.event = "node."+this.type+"."+eventname;
    metrics.msgid = msg._msgid;
    metrics.value = metricValue;
    Log.log(metrics);
}

/**
 * status: { fill:"red|green", shape:"dot|ring", text:"blah" }
 */
Node.prototype.status = function(status) {
    flows.handleStatus(this,status);
};
module.exports = Node;
