// We don't want to be in the bot detection business, so we record impressions
// via javascript in the browser, just like google analytics

apos.on('ready', function() {
  window.AposAdsReady();
});

// You can override me if you want

window.AposAdsReady = function() {
  $('[data-apos-ad]').each(function() {
    var $ad = $(this);
    if ($ad.data('recorded')) {
      return;
    }
    $ad.data('recorded', true);
    $.jsonCall(
      '/apos-ads/record-impression',
      { id: $ad.attr('data-apos-ad') },
      function() { }
    );
  });
};

