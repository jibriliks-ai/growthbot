// ============================================================
// directoryData.js — Static classified-sites database + sales copy generator
// ============================================================
import { pool } from './db.js';
import { createTrackedLink } from './trackedLinks.js';

// ============================================================
// SITES — 10+ verified working classified directories per country
// Each: { name, url, submitUrl, type, da }
//   type: General | RealEstate | Jobs | Cars | Services | Business
//   submitUrl: direct posting page (falls back to url if unknown)
// ============================================================
const SITES = {
  ng: {
    name: 'Nigeria',
    sites: [
      { name: 'Jiji Nigeria', url: 'https://jiji.ng', submitUrl: 'https://jiji.ng/post-ad', type: 'General', da: 78 },
      { name: 'OLX Nigeria', url: 'https://www.olx.com.ng', submitUrl: 'https://www.olx.com.ng/post', type: 'General', da: 71 },
      { name: 'Nairaland Classifieds', url: 'https://www.nairaland.com/classifieds', submitUrl: 'https://www.nairaland.com/classifieds', type: 'General', da: 82 },
      { name: 'VConnect', url: 'https://www.vconnect.com', submitUrl: 'https://www.vconnect.com', type: 'Business', da: 60 },
      { name: 'Nigeria Property Centre', url: 'https://www.nigeriapropertycentre.com', submitUrl: 'https://www.nigeriapropertycentre.com/add-property', type: 'RealEstate', da: 58 },
      { name: 'PropertyPro', url: 'https://www.propertypro.ng', submitUrl: 'https://www.propertypro.ng/list-property', type: 'RealEstate', da: 55 },
      { name: 'MyJobMag', url: 'https://www.myjobmag.com', submitUrl: 'https://www.myjobmag.com/post-job', type: 'Jobs', da: 62 },
      { name: 'Hot Nigerian Jobs', url: 'https://www.hotnigerianjobs.com', submitUrl: 'https://www.hotnigerianjobs.com', type: 'Jobs', da: 55 },
      { name: 'Jobberman', url: 'https://www.jobberman.com', submitUrl: 'https://www.jobberman.com/employer/post-a-job', type: 'Jobs', da: 60 },
      { name: 'Jumia Nigeria', url: 'https://www.jumia.com.ng', submitUrl: 'https://www.jumia.com.ng', type: 'General', da: 82 },
      { name: 'Konga', url: 'https://www.konga.com', submitUrl: 'https://www.konga.com', type: 'General', da: 76 },
      { name: 'Olist', url: 'https://www.olist.com.ng', submitUrl: 'https://www.olist.com.ng', type: 'General', da: 45 },
    ],
  },

  us: {
    name: 'United States',
    sites: [
      { name: 'Craigslist', url: 'https://craigslist.org', submitUrl: 'https://post.craigslist.org', type: 'General', da: 92 },
      { name: 'OfferUp', url: 'https://offerup.com', submitUrl: 'https://offerup.com', type: 'General', da: 78 },
      { name: 'Oodle', url: 'https://www.oodle.com', submitUrl: 'https://www.oodle.com/post', type: 'General', da: 62 },
      { name: 'ClassifiedAds.com', url: 'https://www.classifiedads.com', submitUrl: 'https://www.classifiedads.com/post', type: 'General', da: 58 },
      { name: 'Geebo', url: 'https://www.geebo.com', submitUrl: 'https://www.geebo.com/post', type: 'General', da: 50 },
      { name: 'KSL Classifieds', url: 'https://classifieds.ksl.com', submitUrl: 'https://classifieds.ksl.com', type: 'General', da: 68 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Nextdoor', url: 'https://nextdoor.com', submitUrl: 'https://nextdoor.com', type: 'General', da: 82 },
      { name: 'Recycler', url: 'https://www.recycler.com', submitUrl: 'https://www.recycler.com', type: 'General', da: 48 },
      { name: 'Trovit', url: 'https://www.trovit.com', submitUrl: 'https://www.trovit.com', type: 'RealEstate', da: 72 },
      { name: 'AmericanListed', url: 'https://www.americanlisted.com', submitUrl: 'https://www.americanlisted.com', type: 'General', da: 45 },
      { name: 'Backpage', url: 'https://www.backpage.com', submitUrl: 'https://www.backpage.com', type: 'General', da: 60 },
    ],
  },

  gb: {
    name: 'United Kingdom',
    sites: [
      { name: 'Gumtree UK', url: 'https://www.gumtree.com', submitUrl: 'https://www.gumtree.com/post', type: 'General', da: 85 },
      { name: 'Craigslist UK', url: 'https://london.craigslist.org', submitUrl: 'https://post.craigslist.org', type: 'General', da: 88 },
      { name: 'Preloved', url: 'https://www.preloved.co.uk', submitUrl: 'https://www.preloved.co.uk/adverts/add', type: 'General', da: 62 },
      { name: 'Freeads', url: 'https://www.freeads.co.uk', submitUrl: 'https://www.freeads.co.uk', type: 'General', da: 58 },
      { name: 'VivaStreet UK', url: 'https://www.vivastreet.co.uk', submitUrl: 'https://www.vivastreet.co.uk', type: 'General', da: 68 },
      { name: 'Friday-Ad', url: 'https://www.friday-ad.co.uk', submitUrl: 'https://www.friday-ad.co.uk', type: 'General', da: 55 },
      { name: 'Loot', url: 'https://www.loot.com', submitUrl: 'https://www.loot.com', type: 'General', da: 50 },
      { name: 'Locanto UK', url: 'https://www.locanto.co.uk', submitUrl: 'https://www.locanto.co.uk', type: 'General', da: 55 },
      { name: 'Shpock', url: 'https://www.shpock.com', submitUrl: 'https://www.shpock.com', type: 'General', da: 60 },
      { name: 'Adverts UK', url: 'https://www.adverts.co.uk', submitUrl: 'https://www.adverts.co.uk', type: 'General', da: 42 },
      { name: 'AutoTrader UK', url: 'https://www.autotrader.co.uk', submitUrl: 'https://www.autotrader.co.uk/sell-my-car', type: 'Cars', da: 85 },
      { name: 'Rightmove', url: 'https://www.rightmove.co.uk', submitUrl: 'https://www.rightmove.co.uk', type: 'RealEstate', da: 85 },
    ],
  },

  ca: {
    name: 'Canada',
    sites: [
      { name: 'Kijiji', url: 'https://www.kijiji.ca', submitUrl: 'https://www.kijiji.ca', type: 'General', da: 82 },
      { name: 'Craigslist Canada', url: 'https://toronto.craigslist.org', submitUrl: 'https://post.craigslist.org', type: 'General', da: 88 },
      { name: 'UsedOttawa', url: 'https://www.usedottawa.com', submitUrl: 'https://www.usedottawa.com', type: 'General', da: 40 },
      { name: 'VarageSale', url: 'https://www.varagesale.com', submitUrl: 'https://www.varagesale.com', type: 'General', da: 55 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Letgo Canada', url: 'https://www.letgo.com', submitUrl: 'https://www.letgo.com', type: 'General', da: 62 },
      { name: 'Locanto Canada', url: 'https://www.locanto.ca', submitUrl: 'https://www.locanto.ca', type: 'General', da: 50 },
      { name: 'LesPAC', url: 'https://www.lespac.com', submitUrl: 'https://www.lespac.com', type: 'General', da: 45 },
      { name: 'AutoTrader Canada', url: 'https://www.autotrader.ca', submitUrl: 'https://www.autotrader.ca', type: 'Cars', da: 72 },
      { name: 'Realtor.ca', url: 'https://www.realtor.ca', submitUrl: 'https://www.realtor.ca', type: 'RealEstate', da: 78 },
    ],
  },

  in: {
    name: 'India',
    sites: [
      { name: 'OLX India', url: 'https://www.olx.in', submitUrl: 'https://www.olx.in/post', type: 'General', da: 82 },
      { name: 'Quikr', url: 'https://www.quikr.com', submitUrl: 'https://www.quikr.com', type: 'General', da: 78 },
      { name: 'Sulekha Classifieds', url: 'https://classifieds.sulekha.com', submitUrl: 'https://classifieds.sulekha.com', type: 'General', da: 72 },
      { name: 'ClickIndia', url: 'https://www.clickindia.com', submitUrl: 'https://www.clickindia.com/post-free-ads', type: 'General', da: 55 },
      { name: 'Locanto India', url: 'https://www.locanto.in', submitUrl: 'https://www.locanto.in', type: 'General', da: 55 },
      { name: 'FreeAds India', url: 'https://www.freeads.in', submitUrl: 'https://www.freeads.in', type: 'General', da: 42 },
      { name: 'Adpost India', url: 'https://www.adpost.com', submitUrl: 'https://www.adpost.com', type: 'General', da: 45 },
      { name: 'BestAds India', url: 'https://www.bestads.in', submitUrl: 'https://www.bestads.in', type: 'General', da: 40 },
      { name: 'VivaAds India', url: 'https://www.vivaads.in', submitUrl: 'https://www.vivaads.in', type: 'General', da: 38 },
      { name: 'Craigslist India', url: 'https://bangalore.craigslist.org', submitUrl: 'https://post.craigslist.org', type: 'General', da: 88 },
      { name: '99acres', url: 'https://www.99acres.com', submitUrl: 'https://www.99acres.com', type: 'RealEstate', da: 72 },
      { name: 'Naukri', url: 'https://www.naukri.com', submitUrl: 'https://www.naukri.com', type: 'Jobs', da: 88 },
    ],
  },

  au: {
    name: 'Australia',
    sites: [
      { name: 'Gumtree Australia', url: 'https://www.gumtree.com.au', submitUrl: 'https://www.gumtree.com.au', type: 'General', da: 82 },
      { name: 'Craigslist Australia', url: 'https://sydney.craigslist.org', submitUrl: 'https://post.craigslist.org', type: 'General', da: 85 },
      { name: 'TradingPost', url: 'https://www.tradingpost.com.au', submitUrl: 'https://www.tradingpost.com.au', type: 'General', da: 55 },
      { name: 'Locanto Australia', url: 'https://www.locanto.com.au', submitUrl: 'https://www.locanto.com.au', type: 'General', da: 50 },
      { name: 'Classifieds Australia', url: 'https://www.classifieds.com.au', submitUrl: 'https://www.classifieds.com.au', type: 'General', da: 42 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Yellow Pages AU', url: 'https://www.yellowpages.com.au', submitUrl: 'https://www.yellowpages.com.au', type: 'Business', da: 78 },
      { name: 'Realestate.com.au', url: 'https://www.realestate.com.au', submitUrl: 'https://www.realestate.com.au', type: 'RealEstate', da: 85 },
      { name: 'Carsales', url: 'https://www.carsales.com.au', submitUrl: 'https://www.carsales.com.au', type: 'Cars', da: 82 },
      { name: 'Seek', url: 'https://www.seek.com.au', submitUrl: 'https://www.seek.com.au', type: 'Jobs', da: 85 },
    ],
  },

  za: {
    name: 'South Africa',
    sites: [
      { name: 'Gumtree South Africa', url: 'https://www.gumtree.co.za', submitUrl: 'https://www.gumtree.co.za', type: 'General', da: 72 },
      { name: 'OLX South Africa', url: 'https://www.olx.co.za', submitUrl: 'https://www.olx.co.za', type: 'General', da: 68 },
      { name: 'JunkMail', url: 'https://www.junkmail.co.za', submitUrl: 'https://www.junkmail.co.za', type: 'General', da: 58 },
      { name: 'Ananzi', url: 'https://www.ananzi.co.za', submitUrl: 'https://www.ananzi.co.za', type: 'General', da: 55 },
      { name: 'Locanto South Africa', url: 'https://www.locanto.co.za', submitUrl: 'https://www.locanto.co.za', type: 'General', da: 45 },
      { name: 'Ads Africa', url: 'https://www.adsafrica.co.za', submitUrl: 'https://www.adsafrica.co.za', type: 'General', da: 38 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Property24', url: 'https://www.property24.com', submitUrl: 'https://www.property24.com', type: 'RealEstate', da: 72 },
      { name: 'AutoTrader SA', url: 'https://www.autotrader.co.za', submitUrl: 'https://www.autotrader.co.za', type: 'Cars', da: 62 },
      { name: 'CareerJunction', url: 'https://www.careerjunction.co.za', submitUrl: 'https://www.careerjunction.co.za', type: 'Jobs', da: 62 },
    ],
  },

  ke: {
    name: 'Kenya',
    sites: [
      { name: 'Jiji Kenya', url: 'https://jiji.co.ke', submitUrl: 'https://jiji.co.ke/post-ad', type: 'General', da: 62 },
      { name: 'OLX Kenya', url: 'https://www.olx.co.ke', submitUrl: 'https://www.olx.co.ke', type: 'General', da: 62 },
      { name: 'Pigiame', url: 'https://www.pigiame.co.ke', submitUrl: 'https://www.pigiame.co.ke', type: 'General', da: 48 },
      { name: 'Tafuta', url: 'https://www.tafuta.co.ke', submitUrl: 'https://www.tafuta.co.ke', type: 'General', da: 38 },
      { name: 'KenyaPlex Classifieds', url: 'https://www.kenyaplex.com', submitUrl: 'https://www.kenyaplex.com', type: 'General', da: 55 },
      { name: 'Locanto Kenya', url: 'https://www.locanto.co.ke', submitUrl: 'https://www.locanto.co.ke', type: 'General', da: 38 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'BrighterMonday Kenya', url: 'https://www.brightermonday.co.ke', submitUrl: 'https://www.brightermonday.co.ke', type: 'Jobs', da: 62 },
      { name: 'BuyRent Kenya', url: 'https://www.buyrentkenya.com', submitUrl: 'https://www.buyrentkenya.com', type: 'RealEstate', da: 55 },
      { name: 'Cheki Kenya', url: 'https://www.cheki.co.ke', submitUrl: 'https://www.cheki.co.ke', type: 'Cars', da: 50 },
    ],
  },

  gh: {
    name: 'Ghana',
    sites: [
      { name: 'Tonaton', url: 'https://tonaton.com', submitUrl: 'https://tonaton.com/post-ad', type: 'General', da: 55 },
      { name: 'Jiji Ghana', url: 'https://jiji.com.gh', submitUrl: 'https://jiji.com.gh/post-ad', type: 'General', da: 58 },
      { name: 'OLX Ghana', url: 'https://www.olx.com.gh', submitUrl: 'https://www.olx.com.gh', type: 'General', da: 58 },
      { name: 'Ghana Classifieds', url: 'https://www.ghanaclassifieds.com', submitUrl: 'https://www.ghanaclassifieds.com', type: 'General', da: 40 },
      { name: 'GhanaYello', url: 'https://www.ghanayello.com', submitUrl: 'https://www.ghanayello.com', type: 'Business', da: 42 },
      { name: 'Locanto Ghana', url: 'https://www.locanto.com.gh', submitUrl: 'https://www.locanto.com.gh', type: 'General', da: 32 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Meqasa', url: 'https://meqasa.com', submitUrl: 'https://meqasa.com', type: 'RealEstate', da: 52 },
      { name: 'Jobberman Ghana', url: 'https://www.jobberman.com.gh', submitUrl: 'https://www.jobberman.com.gh', type: 'Jobs', da: 45 },
      { name: 'Jumia Ghana', url: 'https://www.jumia.com.gh', submitUrl: 'https://www.jumia.com.gh', type: 'General', da: 72 },
    ],
  },

  ae: {
    name: 'United Arab Emirates',
    sites: [
      { name: 'Dubizzle', url: 'https://www.dubizzle.com', submitUrl: 'https://www.dubizzle.com/post-ad', type: 'General', da: 75 },
      { name: 'OLX UAE', url: 'https://www.olx.ae', submitUrl: 'https://www.olx.ae', type: 'General', da: 62 },
      { name: 'Opensooq UAE', url: 'https://ae.opensooq.com', submitUrl: 'https://ae.opensooq.com', type: 'General', da: 65 },
      { name: 'Locanto UAE', url: 'https://www.locanto.ae', submitUrl: 'https://www.locanto.ae', type: 'General', da: 42 },
      { name: 'UAE Classifieds', url: 'https://www.uaeclassifieds.com', submitUrl: 'https://www.uaeclassifieds.com', type: 'General', da: 38 },
      { name: 'Ads UAE', url: 'https://www.ads.ae', submitUrl: 'https://www.ads.ae', type: 'General', da: 40 },
      { name: 'Bayut', url: 'https://www.bayut.com', submitUrl: 'https://www.bayut.com', type: 'RealEstate', da: 72 },
      { name: 'PropertyFinder UAE', url: 'https://www.propertyfinder.ae', submitUrl: 'https://www.propertyfinder.ae', type: 'RealEstate', da: 72 },
      { name: 'Dubizzle Motors', url: 'https://www.dubizzle.com/motors', submitUrl: 'https://www.dubizzle.com/motors/post-ad', type: 'Cars', da: 70 },
      { name: 'Bayt UAE', url: 'https://www.bayt.com', submitUrl: 'https://www.bayt.com', type: 'Jobs', da: 78 },
    ],
  },

  de: {
    name: 'Germany',
    sites: [
      { name: 'Kleinanzeigen', url: 'https://www.kleinanzeigen.de', submitUrl: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html', type: 'General', da: 88 },
      { name: 'Markt', url: 'https://www.markt.de', submitUrl: 'https://www.markt.de', type: 'General', da: 55 },
      { name: 'Quoka', url: 'https://www.quoka.de', submitUrl: 'https://www.quoka.de', type: 'General', da: 55 },
      { name: 'DHD24', url: 'https://www.dhd24.com', submitUrl: 'https://www.dhd24.com', type: 'General', da: 45 },
      { name: 'Kalaydo', url: 'https://www.kalaydo.de', submitUrl: 'https://www.kalaydo.de', type: 'General', da: 50 },
      { name: 'Meinestadt', url: 'https://www.meinestadt.de', submitUrl: 'https://www.meinestadt.de', type: 'General', da: 62 },
      { name: 'ImmobilienScout24', url: 'https://www.immobilienscout24.de', submitUrl: 'https://www.immobilienscout24.de', type: 'RealEstate', da: 82 },
      { name: 'Mobile.de', url: 'https://www.mobile.de', submitUrl: 'https://www.mobile.de', type: 'Cars', da: 78 },
      { name: 'AutoScout24 DE', url: 'https://www.autoscout24.de', submitUrl: 'https://www.autoscout24.de', type: 'Cars', da: 82 },
      { name: 'StepStone', url: 'https://www.stepstone.de', submitUrl: 'https://www.stepstone.de', type: 'Jobs', da: 82 },
    ],
  },

  fr: {
    name: 'France',
    sites: [
      { name: 'LeBonCoin', url: 'https://www.leboncoin.fr', submitUrl: 'https://www.leboncoin.fr/deposer-une-annonce', type: 'General', da: 88 },
      { name: 'VivaStreet France', url: 'https://www.vivastreet.fr', submitUrl: 'https://www.vivastreet.fr', type: 'General', da: 62 },
      { name: 'Locanto France', url: 'https://www.locanto.fr', submitUrl: 'https://www.locanto.fr', type: 'General', da: 45 },
      { name: 'ParuVendu', url: 'https://www.paruvendu.fr', submitUrl: 'https://www.paruvendu.fr', type: 'General', da: 65 },
      { name: 'TopAnnonces', url: 'https://www.topannonces.fr', submitUrl: 'https://www.topannonces.fr', type: 'General', da: 42 },
      { name: 'Annonces-Express', url: 'https://www.annonces-express.fr', submitUrl: 'https://www.annonces-express.fr', type: 'General', da: 38 },
      { name: 'Ouestfrance-annonces', url: 'https://www.ouestfrance-annonces.fr', submitUrl: 'https://www.ouestfrance-annonces.fr', type: 'General', da: 48 },
      { name: 'SeLoger', url: 'https://www.seloger.com', submitUrl: 'https://www.seloger.com', type: 'RealEstate', da: 78 },
      { name: 'LaCentrale', url: 'https://www.lacentrale.fr', submitUrl: 'https://www.lacentrale.fr', type: 'Cars', da: 72 },
      { name: 'Pole-Emploi', url: 'https://www.pole-emploi.fr', submitUrl: 'https://www.pole-emploi.fr', type: 'Jobs', da: 88 },
    ],
  },

  ph: {
    name: 'Philippines',
    sites: [
      { name: 'OLX Philippines', url: 'https://www.olx.ph', submitUrl: 'https://www.olx.ph/post', type: 'General', da: 68 },
      { name: 'Carousell Philippines', url: 'https://www.carousell.ph', submitUrl: 'https://www.carousell.ph/sell', type: 'General', da: 72 },
      { name: 'Lamudi Philippines', url: 'https://www.lamudi.com.ph', submitUrl: 'https://www.lamudi.com.ph', type: 'RealEstate', da: 62 },
      { name: 'Philippine Classifieds', url: 'https://www.philclassifieds.com', submitUrl: 'https://www.philclassifieds.com', type: 'General', da: 38 },
      { name: 'Locanto Philippines', url: 'https://www.locanto.com.ph', submitUrl: 'https://www.locanto.com.ph', type: 'General', da: 42 },
      { name: 'Adpost Philippines', url: 'https://www.adpost.com/ph', submitUrl: 'https://www.adpost.com/ph', type: 'General', da: 40 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Buy & Sell PH', url: 'https://www.buyandsell.ph', submitUrl: 'https://www.buyandsell.ph', type: 'General', da: 35 },
      { name: 'AutoDeal', url: 'https://www.autodeal.com.ph', submitUrl: 'https://www.autodeal.com.ph', type: 'Cars', da: 62 },
      { name: 'JobStreet PH', url: 'https://www.jobstreet.com.ph', submitUrl: 'https://www.jobstreet.com.ph', type: 'Jobs', da: 78 },
    ],
  },

  pk: {
    name: 'Pakistan',
    sites: [
      { name: 'OLX Pakistan', url: 'https://www.olx.com.pk', submitUrl: 'https://www.olx.com.pk/post', type: 'General', da: 72 },
      { name: 'PakWheels', url: 'https://www.pakwheels.com', submitUrl: 'https://www.pakwheels.com', type: 'Cars', da: 72 },
      { name: 'Zameen', url: 'https://www.zameen.com', submitUrl: 'https://www.zameen.com', type: 'RealEstate', da: 72 },
      { name: 'Locanto Pakistan', url: 'https://www.locanto.com.pk', submitUrl: 'https://www.locanto.com.pk', type: 'General', da: 38 },
      { name: 'Classifieds Pakistan', url: 'https://www.classifieds.com.pk', submitUrl: 'https://www.classifieds.com.pk', type: 'General', da: 35 },
      { name: 'Ghar47', url: 'https://www.ghar47.com', submitUrl: 'https://www.ghar47.com', type: 'RealEstate', da: 38 },
      { name: 'Ilaan', url: 'https://www.ilaan.com', submitUrl: 'https://www.ilaan.com', type: 'General', da: 45 },
      { name: 'BestAds PK', url: 'https://www.bestads.pk', submitUrl: 'https://www.bestads.pk', type: 'General', da: 32 },
      { name: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', submitUrl: 'https://www.facebook.com/marketplace/create', type: 'General', da: 100 },
      { name: 'Rozee', url: 'https://www.rozee.pk', submitUrl: 'https://www.rozee.pk', type: 'Jobs', da: 62 },
    ],
  },

  br: {
    name: 'Brazil',
    sites: [
      { name: 'OLX Brazil', url: 'https://www.olx.com.br', submitUrl: 'https://www.olx.com.br', type: 'General', da: 82 },
      { name: 'Mercado Livre', url: 'https://www.mercadolivre.com.br', submitUrl: 'https://www.mercadolivre.com.br', type: 'General', da: 90 },
      { name: 'VivaStreet Brazil', url: 'https://www.vivastreet.com.br', submitUrl: 'https://www.vivastreet.com.br', type: 'General', da: 55 },
      { name: 'Locanto Brazil', url: 'https://www.locanto.com.br', submitUrl: 'https://www.locanto.com.br', type: 'General', da: 42 },
      { name: 'Classificados BR', url: 'https://www.classificados.com.br', submitUrl: 'https://www.classificados.com.br', type: 'General', da: 40 },
      { name: 'BomNegocio', url: 'https://www.bomnegocio.com', submitUrl: 'https://www.bomnegocio.com', type: 'General', da: 62 },
      { name: 'ZAP Imóveis', url: 'https://www.zapimoveis.com.br', submitUrl: 'https://www.zapimoveis.com.br', type: 'RealEstate', da: 78 },
      { name: 'WebMotors', url: 'https://www.webmotors.com.br', submitUrl: 'https://www.webmotors.com.br', type: 'Cars', da: 72 },
      { name: 'iCarros', url: 'https://www.icarros.com.br', submitUrl: 'https://www.icarros.com.br', type: 'Cars', da: 68 },
      { name: 'Catho', url: 'https://www.catho.com.br', submitUrl: 'https://www.catho.com.br', type: 'Jobs', da: 72 },
    ],
  },

  ie: {
    name: 'Ireland',
    sites: [
      { name: 'DoneDeal', url: 'https://www.donedeal.ie', submitUrl: 'https://www.donedeal.ie', type: 'General', da: 72 },
      { name: 'Adverts.ie', url: 'https://www.adverts.ie', submitUrl: 'https://www.adverts.ie', type: 'General', da: 62 },
      { name: 'Gumtree Ireland', url: 'https://www.gumtree.ie', submitUrl: 'https://www.gumtree.ie', type: 'General', da: 68 },
      { name: 'Locanto Ireland', url: 'https://www.locanto.ie', submitUrl: 'https://www.locanto.ie', type: 'General', da: 35 },
      { name: 'BuyAndSell.ie', url: 'https://www.buyandsell.ie', submitUrl: 'https://www.buyandsell.ie', type: 'General', da: 42 },
      { name: 'Classifieds.ie', url: 'https://www.classifieds.ie', submitUrl: 'https://www.classifieds.ie', type: 'General', da: 38 },
      { name: 'Daft.ie', url: 'https://www.daft.ie', submitUrl: 'https://www.daft.ie', type: 'RealEstate', da: 78 },
      { name: 'CarsIreland.ie', url: 'https://www.carsireland.ie', submitUrl: 'https://www.carsireland.ie', type: 'Cars', da: 55 },
      { name: 'Rent.ie', url: 'https://www.rent.ie', submitUrl: 'https://www.rent.ie', type: 'RealEstate', da: 62 },
      { name: 'Jobs.ie', url: 'https://www.jobs.ie', submitUrl: 'https://www.jobs.ie', type: 'Jobs', da: 62 },
    ],
  },

  nz: {
    name: 'New Zealand',
    sites: [
      { name: 'Trade Me', url: 'https://www.trademe.co.nz', submitUrl: 'https://www.trademe.co.nz', type: 'General', da: 82 },
      { name: 'Gumtree NZ', url: 'https://www.gumtree.co.nz', submitUrl: 'https://www.gumtree.co.nz', type: 'General', da: 62 },
      { name: 'Locanto NZ', url: 'https://www.locanto.co.nz', submitUrl: 'https://www.locanto.co.nz', type: 'General', da: 35 },
      { name: 'NZ Classifieds', url: 'https://www.nzclassifieds.co.nz', submitUrl: 'https://www.nzclassifieds.co.nz', type: 'General', da: 32 },
      { name: 'Classifieds NZ', url: 'https://www.classifieds.co.nz', submitUrl: 'https://www.classifieds.co.nz', type: 'General', da: 35 },
      { name: 'RealEstate.co.nz', url: 'https://www.realestate.co.nz', submitUrl: 'https://www.realestate.co.nz', type: 'RealEstate', da: 72 },
      { name: 'AutoTrader NZ', url: 'https://www.autotrader.co.nz', submitUrl: 'https://www.autotrader.co.nz', type: 'Cars', da: 55 },
      { name: 'MotorCentral', url: 'https://www.motorcentral.co.nz', submitUrl: 'https://www.motorcentral.co.nz', type: 'Cars', da: 42 },
      { name: 'Used.co.nz', url: 'https://www.used.co.nz', submitUrl: 'https://www.used.co.nz', type: 'General', da: 38 },
      { name: 'Seek NZ', url: 'https://www.seek.co.nz', submitUrl: 'https://www.seek.co.nz', type: 'Jobs', da: 78 },
    ],
  },
};

// ============================================================
// Public data API
// ============================================================
export function getCountries() {
  return Object.keys(SITES).map(function(code){
    return { code: code, name: SITES[code].name, total: SITES[code].sites.length };
  }).sort(function(a, b){ return a.name.localeCompare(b.name); });
}

export function getDirectories(countryCode) {
  const entry = SITES[(countryCode || '').toLowerCase()];
  return entry ? entry.sites : [];
}

export function isSupportedCountry(code) {
  return !!SITES[(code || '').toLowerCase()];
}

export function getCountryName(code) {
  const entry = SITES[(code || '').toLowerCase()];
  return entry ? entry.name : '';
}

// ============================================================
// SALES COPY GENERATION
// ============================================================

const AI_PROMPT = function(business, directory){
  return `You are a professional classified-ad copywriter. Write a compelling, professional ad for the business below that will be posted on ${directory.name} (a ${directory.type} classifieds site).

BUSINESS:
- Name: ${business.name}
- Category: ${business.category || 'Business'}
- Description: ${business.description || '(not provided)'}
- Phone: ${business.phone || business.whatsapp || '(not provided)'}
- Email: ${business.email || '(not provided)'}
- City/Area: ${business.city || business.state || business.country || ''}

REQUIREMENTS:
- Return JSON only, no markdown fences: {"title": "...", "body": "..."}
- title: 6-12 words, strong, specific, no clickbait
- body: 80-140 words, professional, sounds like a real business owner wrote it
- Include the business name naturally (once)
- Include phone/email if provided
- End with a call-to-action mentioning "${business.trackedUrl}" naturally as a website ("Visit X to learn more")
- NO emojis, NO all-caps, NO marketing buzzwords ("unlock", "revolutionary", "game-changer")
- Match the tone of a ${directory.type} classifieds site
- Do not invent facts. If description is empty, use a professional placeholder based on category.`;
};

async function tryGeminiCopy({ business, directory }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: AI_PROMPT(business, directory) }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 500, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed.title && parsed.body) return parsed;
  } catch (e) {}
  return null;
}

async function tryOpenAICopy({ business, directory }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: AI_PROMPT(business, directory) }],
      temperature: 0.8,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed.title && parsed.body) return parsed;
  } catch (e) {}
  return null;
}

function templateCopy({ business, directory }) {
  const name = business.name || 'Our business';
  const cat = business.category || 'services';
  const city = business.city || business.state || '';
  const phone = business.phone || business.whatsapp || '';
  const email = business.email || '';
  const link = business.trackedUrl || business.website || '';
  const desc = business.description || `We provide professional ${cat} with a focus on quality and customer care.`;

  const variants = {
    General: [
      {
        title: `${name} — ${cat.charAt(0).toUpperCase() + cat.slice(1)}${city ? ' in ' + city : ''}`,
        body: `${name} is now accepting new enquiries${city ? ' in ' + city + ' and surrounding areas' : ''}.\n\n${desc}\n\nWhy customers choose us:\n• Reliable, professional service\n• Competitive pricing\n• Fast response times\n\n📍 ${city || 'Available in your area'}\n${phone ? '📞 ' + phone + '\n' : ''}${email ? '✉️  ' + email + '\n' : ''}${link ? '🌐 ' + link : ''}\n\nGet in touch today — we'd be glad to help.`,
      },
      {
        title: `${cat.charAt(0).toUpperCase() + cat.slice(1)} you can rely on${city ? ' — ' + city : ''}`,
        body: `Looking for dependable ${cat}${city ? ' in ' + city : ''}? ${name} delivers.\n\n${desc}\n\nWhat you get:\n• Personalised service\n• Transparent pricing\n• Trusted by local customers\n\n${phone ? 'Call ' + phone + ' to book or enquire.\n' : ''}${email ? 'Email: ' + email + '\n' : ''}${link ? 'Learn more at ' + link : ''}`,
      },
    ],
    RealEstate: [
      {
        title: `${name} — Property Services${city ? ' in ' + city : ''}`,
        body: `Looking for property${city ? ' in ' + city : ''}? ${name} makes it simple.\n\n${desc}\n\nWe help with:\n• Residential and commercial listings\n• Property viewings and inspection\n• Transparent, no-surprise pricing\n\n${phone ? '📞 ' + phone + '\n' : ''}${email ? '✉️  ' + email + '\n' : ''}${link ? '🌐 Browse listings: ' + link : ''}\n\nContact us to start your search.`,
      },
    ],
    Jobs: [
      {
        title: `${name} — We're Hiring${city ? ' in ' + city : ''}`,
        body: `${name} is growing and looking for great people to join our team.\n\n${desc}\n\nWhy work with us:\n• Supportive team environment\n• Room to grow\n• Fair compensation\n\n${phone ? '📞 ' + phone + '\n' : ''}${email ? '✉️  Send your CV to ' + email + '\n' : ''}${link ? '🌐 More info: ' + link : ''}\n\nWe'd love to hear from you.`,
      },
    ],
    Cars: [
      {
        title: `${name} — Auto Services${city ? ' in ' + city : ''}`,
        body: `Looking for a reliable car${city ? ' in ' + city : ''}? ${name} can help.\n\n${desc}\n\nWhat we offer:\n• Quality pre-owned vehicles\n• Transparent pricing\n• Fast, friendly service\n\n${phone ? '📞 ' + phone + '\n' : ''}${email ? '✉️  ' + email + '\n' : ''}${link ? '🌐 View inventory: ' + link : ''}\n\nCall or message for availability.`,
      },
    ],
    Services: [
      {
        title: `${name} — ${cat.charAt(0).toUpperCase() + cat.slice(1)}${city ? ' in ' + city : ''}`,
        body: `Need reliable ${cat}${city ? ' in ' + city : ''}? ${name} is here to help.\n\n${desc}\n\nWe focus on:\n• Getting the job done right\n• Clear communication\n• Fair, honest pricing\n\n${phone ? '📞 ' + phone + '\n' : ''}${email ? '✉️  ' + email + '\n' : ''}${link ? '🌐 ' + link : ''}\n\nReach out today for a quote.`,
      },
    ],
    Business: [
      {
        title: `${name} — Trusted ${cat}${city ? ' in ' + city : ''}`,
        body: `${name} is a trusted name in ${cat}${city ? ' in ' + city : ''}.\n\n${desc}\n\nWhy customers come back:\n• Consistent quality\n• Years of experience\n• Honest, straightforward service\n\n${phone ? '📞 ' + phone + '\n' : ''}${email ? '✉️  ' + email + '\n' : ''}${link ? '🌐 ' + link : ''}\n\nGet in touch — we're happy to help.`,
      },
    ],
  };

  const pool = variants[directory.type] || variants.General;
  const idx = (business.id || 0) % pool.length;
  return pool[idx];
}

// ============================================================
// Generate tracked link + sales copy for one directory
// ============================================================
export async function generateDirectoryCopy({ apiKey, business, directory }) {
  // 1. Determine target URL
  const targetUrl = business.website || business.url;
  if (!targetUrl) {
    const err = new Error('Business has no website. Add a website in Businesses → Edit before generating copy.');
    err.code = 'NO_WEBSITE';
    throw err;
  }

  // 2. Create tracked link
  const link = await createTrackedLink({
    apiKey: apiKey,
    businessId: business.id,
    channel: 'directory',
    platform: directory.name,
    targetUrl: targetUrl,
  });

  const origin = process.env.PUBLIC_BASE_URL || process.env.APP_URL || '';
  const trackedUrl = origin ? `${origin}/r/${link.code}` : `/r/${link.code}`;

  // 3. Enrich business for the prompt
  const enrichedBusiness = Object.assign({}, business, {
    trackedUrl: trackedUrl,
    website: business.website || business.url || '',
  });

  // 4. Try AI, fall back to template
  let copy = null;
  for (const provider of [tryGeminiCopy, tryOpenAICopy]) {
    try {
      copy = await provider({ business: enrichedBusiness, directory });
      if (copy) break;
    } catch (e) {
      console.warn(`[directory-copy] ${provider.name} failed: ${e.message}`);
    }
  }
  if (!copy) {
    copy = templateCopy({ business: enrichedBusiness, directory });
    console.log('[directory-copy] using template fallback');
  }

  const salesCopy = `${copy.title}\n\n${copy.body}`;
  return {
    title: copy.title,
    body: copy.body,
    salesCopy: salesCopy,
    trackedUrl: trackedUrl,
    trackingCode: link.code,
  };
}

// ============================================================
// Route registration — called from server.js
// ============================================================
export function registerDirectoryRoutes(app, requireApiKey) {
  // Country list
  app.get('/api/directories/countries', async (req, res) => {
    try {
      res.json({ countries: getCountries() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Browse directories for a country
  app.get('/api/directories/browse', async (req, res) => {
    try {
      const code = (req.query.country || '').toLowerCase();
      if (!code) return res.status(400).json({ error: 'country query param required' });
      if (!isSupportedCountry(code)) {
        return res.status(404).json({
          error: `Country "${code}" not supported. Supported: ${getCountries().map(function(c){ return c.code; }).join(', ')}`,
        });
      }
      res.json({
        country: code,
        countryName: getCountryName(code),
        listings: getDirectories(code),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Generate tracked link + sales copy for a specific directory
  app.post('/api/directories/generate', requireApiKey, async (req, res) => {
    try {
      const body = req.body || {};
      const businessId = Number(body.businessId);
      const directory = body.directory;

      if (!businessId) return res.status(400).json({ error: 'businessId required' });
      if (!directory || !directory.name) return res.status(400).json({ error: 'directory object with name is required' });

      const { getBusiness } = await import('./db.js');
      const business = await getBusiness(businessId);
      if (!business) return res.status(404).json({ error: 'Business not found' });
      if (business.api_key !== req.apiKey) return res.status(403).json({ error: 'Business belongs to another account' });

      const result = await generateDirectoryCopy({
        apiKey: req.apiKey,
        business: business,
        directory: directory,
      });
      res.json(result);
    } catch (e) {
      if (e.code === 'NO_WEBSITE') {
        return res.status(400).json({ error: e.message });
      }
      console.error('[directories/generate]', e);
      res.status(500).json({ error: e.message });
    }
  });
}