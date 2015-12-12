function AposAds(optionsArg) {
  var self = this;
  var options = {
    instance: 'ad',
    name: 'ad'
  };
  $.extend(options, optionsArg);
  AposSnippets.call(self, options);
}

