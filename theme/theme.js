/* Resco Mail temasi — SOGo Angular Material paleti.
   Taban: SOGo 5.12.9 varsayilan theme.js (prod'dan alindi, 2026-08-07).
   Renk karari (Bulent onayi): logo mavisi #1E88E5 + lacivert #33424F. */

(function() {
  'use strict';

  angular.module('SOGo.Common')
    .config(configure)

  /**
   * @ngInject
   */
  configure.$inject = ['$mdThemingProvider'];
  function configure($mdThemingProvider) {

    // Acik zemin paleti (grey uzerinden)
    var rescoGreyMap = $mdThemingProvider.extendPalette('grey', {
      // sag panel + menu (autocomplete/sag-tik) zeminleri
      '200': 'ECF1F6',
      // kenar cubugu zemini
      '300': 'DDE6EE',
      // katilimci editorunde dolu saat bloklari
      '1000': '33424F'
    });
    $mdThemingProvider.definePalette('resco-grey', rescoGreyMap);

    // Marka paleti: Material blue + lacivert koyu uclar
    var rescoBlueMap = $mdThemingProvider.extendPalette('blue', {
      '600': '1E88E5',   // logo mavisi
      '800': '2C3E50',   // lacivert (kenar cubugu ust bari)
      '900': '33424F'    // logo lacivert zemini
    });
    $mdThemingProvider.definePalette('resco-blue', rescoBlueMap);

    $mdThemingProvider.theme('default')
      .primaryPalette('resco-blue', {
        'default': '600',  // ust bar — logo mavisi
        'hue-1': '400',
        'hue-2': '800',    // kenar cubugu ust bari — lacivert
        'hue-3': 'A700'
      })
      .accentPalette('resco-blue', {
        'default': '600',  // fab butonlar — logo mavisi
        'hue-1': '100',    // orta liste bari — acik mavi
        'hue-2': '300',
        'hue-3': 'A700'
      })
      .backgroundPalette('resco-grey');

    $mdThemingProvider.generateThemesOnDemand(false);
  }
})();
