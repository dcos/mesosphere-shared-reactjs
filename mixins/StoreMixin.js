var StringUtil = require('../utils/StringUtil');
var Util = require('../utils/Util');

var LISTENER_SUFFIX = 'ListenerFn';
var ListenersDescription = {
  // Example store
  // user: {
  //   store: UserStoreHere,
  //   events: {
  //     success: 'USER_STORE_SUCCESS'
  //   },
  //   unmountWhen: function () {
  //     return true;
  //   },
  //   listenAlways: true,
  //   suppressUpdate: false
  // }
};

var StoreMixin = {
  store_initializeListeners: function (storeListeners) {
    // Create a map of listeners, becomes useful later
    var storesListeners = {};

    // Merges options for each store listener with
    // the ListenersDescription definition above
    storeListeners.forEach(function (listener) {
      if (typeof listener === 'string') {
        if (!ListenersDescription[listener]) {
          return;
        }
        // Use all defaults
        storesListeners[listener] = Util.clone(ListenersDescription[listener]);
      } else {
        var storeName = listener.name;
        var events = listener.events;

        if (!ListenersDescription[storeName]) {
          return;
        }
        // Populate events by key. For example, a component
        // may only want to listen for 'success' events
        if (events) {
          listener.events = {};
          events.forEach(function (event) {
            listener.events[event] =
              ListenersDescription[storeName].events[event];
          });
        }

        storesListeners[storeName] = Util.extend(
          {}, ListenersDescription[storeName], listener
        );
      }
    });

    // Default unmountWhen to unmount immediately when suppressUpdate is not
    // explicity set
    if (this.unmountWhen == null && typeof(this.suppressUpdate) === 'undefined') {
      this.unmountWhen = function () {
        return true;
      }
    }

    // TODO: this.store_listeners gets changed from an array to an object here.
    // We shouldn't modify the structure
    this.store_listeners = storesListeners;
    this.store_addListeners();
  },

  // Auto set listeners on react components
  componentDidMount: function () {
    if (this.store_listeners) {
      this.store_initializeListeners(this.store_listeners);
    }
  },
  // Auto clear listeners on react components
  componentWillUnmount: function () {
    this.store_removeListeners();
  },

  store_configure: function (stores) {
    ListenersDescription = stores;
  },

  store_addListeners: function () {
    Object.keys(this.store_listeners).forEach(function (storeID) {
      var listenerDetail = this.store_listeners[storeID];
      var events = listenerDetail.events;

      // Check that we actually have events to fire events on
      if (process.env.NODE_ENV !== 'production' &&
        (typeof events !== 'object' || !Object.keys(events).length)) {
        throw new Error('No events found on listener configuration for store ' +
          'with ID "' + storeID + '".');
      }
      // Loop through all available events
      Object.keys(events).forEach(function (event) {
        var eventListenerID = event + LISTENER_SUFFIX;

        // Check to see if we are already listening for this event
        if (listenerDetail[eventListenerID]) {
          return;
        }

        // Create listener
        listenerDetail[eventListenerID] = this.store_onStoreChange.bind(
          this, storeID, event
        );

        // Set up listener with store
        listenerDetail.store.addChangeListener(
          events[event], listenerDetail[eventListenerID]
        );
      }.bind(this));
    }.bind(this));
  },

  store_removeListeners: function () {
    Object.keys(this.store_listeners).forEach(function (storeID) {
      var listenerDetail = this.store_listeners[storeID];

      // Loop through all available events
      Object.keys(listenerDetail.events).forEach(function (event) {
        this.store_removeEventListenerForStoreID(storeID, event);
      }.bind(this));
    }.bind(this));
  },

  store_removeEventListenerForStoreID: function (storeID, event) {
    var listenerDetail = this.store_listeners[storeID];
    var eventListenerID = event + LISTENER_SUFFIX;

    // Return if there was no listener setup
    if (!listenerDetail[eventListenerID]) {
      return;
    }

    listenerDetail.store.removeChangeListener(
      listenerDetail.events[event], listenerDetail[eventListenerID]
    );

    listenerDetail[eventListenerID] = null;
  },

  /**
   * This is a callback that will be invoked when stores emit a change event
   *
   * @param  {String} storeID The id of a store
   * @param  {String} event Normally a string containing success|error
   */
  store_onStoreChange: function (storeID, event) {
    var args = Array.prototype.slice.call(arguments, 2);
    // See if we need to remove our change listener
    var listenerDetail = this.store_listeners[storeID];
    // Maybe remove listener
    if (listenerDetail.unmountWhen && !listenerDetail.listenAlways) {
      // Remove change listener if the settings want to unmount after a certain
      // condition is truthy
      if (listenerDetail.unmountWhen(listenerDetail.store, event)) {
        this.store_removeEventListenerForStoreID(storeID, event);
      }
    }

    // Call callback on component that implements mixin if it exists
    var onChangeFn = this.store_getChangeFunctionName(storeID, event);

    if (this[onChangeFn]) {
      this[onChangeFn].apply(this, args);
    }

    // forceUpdate if not suppressed by configuration
    if (listenerDetail.suppressUpdate !== true && typeof this.forceUpdate === 'function') {
      if (process.env.NODE_ENV === 'performance') {
        var warning = 'Forced upates are an antipattern. ';
        if (this.saveState_key != null) {
          warning += 'Check the render method of ' + this.saveState_key + '.';
        }
        console.warn(warning);
      }
      this.forceUpdate();
    }
  },

  store_getChangeFunctionName: function (storeID, event) {
    var storeName = StringUtil.capitalize(storeID);
    var eventName = StringUtil.capitalize(event);

    return 'on' + storeName + 'Store' + eventName;
  }
};

module.exports = StoreMixin;
