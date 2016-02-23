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

  self.clickThrough = function(req, res) {
    var adId = req.query.id || null;

    if(!adId) {
      res.statusCode = 404;
      return res.send('notfound');
    }

    var taskReq = self._apos.getTaskReq();

    return self.getOne(taskReq, { _id: req.query.id }, {}, function(err, result) {
      if(err || !result) {
        res.statusCode = 404;
        return res.send('notfound');
      }

      // increment the ad's clicks, but only if the page is being loaded by
      // a non apostrophe user.
      if(!req.user) {
        if(!result.clicks) {
          result.clicks = 0;
        }

        result.clicks += 1;
      }

      return self.putOne(taskReq, result.slug, {}, result, function(err){
        if(err) {
          res.statusCode = 404;
          return res.send(err);
        }

        return res.redirect(result.targetUrl);
      });
    });
  }

  self.incrementImpressions = function(ads) {
    var req = self._apos.getTaskReq();

    return async.each(ads, function(ad, callback) {
      if(!ad.impressions) {
        ad.impressions = 0;
      }

      ad.impressions += 1;
      return self.putOne(req, ad.slug, {}, ad, callback);
    });
  }

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

      // Limit is always 1. Widget never serves more than one ad.
      options.limit = 1;
    }

    var superRenderWidget = widget.renderWidget;
    widget.renderWidget = function(data) {
      if(data.item && data.item._snippets) {
        self.incrementImpressions(data.item._snippets);
      }

      return superRenderWidget(data);
    };
  };

  if (callback) {
    process.nextTick(function() { return callback(null); });
  }
}
