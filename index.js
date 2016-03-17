var async = require('async');
var _ = require('lodash');
var extend = require('extend');
var snippets = require('apostrophe-snippets');

module.exports = ads;

function ads(options, callback) {
  return new ads.Ads(options, callback);
}

ads.Ads = function(options, callback) {
  var self = this;
  self._apos = options.apos;

  _.defaults(options, {
    instance: 'ad',
    name: options.name || 'ads',
    label: options.label || 'Ads',
    instanceLabel: options.instanceLabel || 'Ad',
    icon: options.icon || 'bullhorn',
    menuName: 'aposAdMenu',
    widget: true
  });

  options.addFields = [
    {
      name: 'creative',
      label: 'Creative',
      type: 'singleton',
      widgetType: 'slideshow',
      options: {
        limit: 1
      }
    },
    {
      name: 'targetUrl',
      label: 'Ad URL',
      type: 'url',
      required: false
    }
  ].concat(options.addFields || []);

  options.removeFields = [
    'hideTitle',
    'thumbnail',
    'body'
  ].concat(options.removeFields || []);

  if (options.groupFields !== false) {
    options.groupFields = options.groupFields || [
      {
        name: 'content',
        label: 'Content',
        icon: 'content',
        fields: ['creative','targetUrl']
      },
      {
        name: 'admin',
        label: 'Admin',
        icon: 'metadata',
        fields: [
          'slug', 'published', 'tags'
        ]
      }
    ];
  }

  options.modules = (options.modules || []).concat([ { dir: __dirname, name: 'ads' } ]);

  snippets.Snippets.call(this, options, null);

  self.beforeInsert = function(req, data, snippet, callback) {
    // make sure we set default values for clicks and impressions.
    snippet.clicks = 0;
    snippet.impressions = 0;

    return callback(null);
  };

  self._app.all(self._action + '/serve', function(req, res) {
    return self.clickThrough(req, res);
  });

  self._app.post(self._action + '/record-impression', function(req, res) {
    return self.recordImpression(req, res);
  });

  self.clickThrough = function(req, res) {
    var adId = self._apos.sanitizeId(req.query.id);

    if (!adId) {
      res.statusCode = 404;
      return res.send('notfound');
    }

    var targetUrl;

    return async.series([ getUrl, incrementClicks ], function(err) {
      if(err) {
        res.statusCode = 404;
        return res.send(err);
      }
      return res.redirect(targetUrl);
    });

    function getUrl(callback) {
      return self.getOne(req, { _id: adId }, { fields: { targetUrl: 1 } }, function(err, result) {
        if (err) {
          return callback(err);
        }
        targetUrl = result.targetUrl;
        return callback(null);
      });
    }

    function incrementClicks(callback) {

      // For performance and prevention of race conditions, go
      // straight to mongo and use $inc. It will create the
      // field if needed. -Tom

      return self._apos.pages.update({
        _id: adId
      }, {
        $inc: { clicks: 1 }
      }, callback);
    }

  };

  self.recordImpression = function(req, res) {
    var adId = self._apos.sanitizeId(req.body.id);

    if (!adId) {
      res.statusCode = 404;
      return res.send('notfound');
    }

    var targetUrl;

    return async.series([ getTest, incrementImpressions ], function(err) {
      if(err) {
        res.statusCode = 404;
        return res.send(err);
      }
      return res.send({ status: 'ok' });
    });

    // Fetching the ad confirms that it's really an ad, this user is
    // allowed to see it, etc.
    function getTest(callback) {
      return self.getOne(req, { _id: adId }, { fields: { DUMMY: 1 } }, callback);
    }

    function incrementImpressions(callback) {

      // For performance and prevention of race conditions, go
      // straight to mongo and use $inc. It will create the
      // field if needed. -Tom

      return self._apos.pages.update({
        _id: adId
      }, {
        $inc: { impressions: 1 }
      }, callback);
    }

  };

  var superGet = self.get;
  self.get = function(req, criteria, options, callback) {
    if(options.serveAutomatically) {
      return self.buildAutomaticCriteria(req, criteria, options, function(req, criteria, options){
        return superGet(req, criteria, options, callback);
      });
    }

    return superGet(req, criteria, options, callback);
  }


  // Override this method to inject your custom criteria
  // and options to serve ads by
  self.buildAutomaticCriteria = function(req, criteria, options, callback) {
    // Hook for implementing your own automatic serving method

    // Finally, do the superGet.
    return callback(req, criteria, options);
  }

  self.extendWidget = function(widget) {
    var superAddCriteria = widget.addCriteria;

    widget.addCriteria = function(item, criteria, options) {
      if ((item.by === 'id') && (item.ids)) {
        // Specific IDs were selected
        criteria._id = { $in: item.ids };
      } else {
        // We are automatically serving ads
        options.serveAutomatically = true;
      }
    }

    widget.renderWidget = function(data) {
      if (data.item._snippets.length) {
        data.item._snippets = [ data.item._snippets[_.random(0, data.item._snippets.length - 1)] ];
      }
      return widget.snippets.render('widget', data);
    };

  };

  if (callback) {
    process.nextTick(function() { return callback(null); });
  }
}
