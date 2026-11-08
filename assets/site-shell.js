/* Shared mobile navigation and contact-click measurement. */
(function () {
  'use strict';
  var header = document.querySelector('.sc-header');
  var mobile = window.matchMedia('(max-width: 650px)');
  var menu;
  var summary;
  var nav;
  var social;
  var navHome;
  var socialHome;

  function closeMenu(restoreFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    if (restoreFocus) summary.focus();
  }

  if (header) {
    nav = header.querySelector('.sc-nav');
    social = header.querySelector('.sc-social');
    var row = header.querySelector('.sc-shell-inner');
    if (nav && row) {
      navHome = document.createComment('Desktop navigation position');
      nav.before(navHome);
      if (social) {
        socialHome = document.createComment('Desktop social links position');
        social.before(socialHome);
      }
      menu = document.createElement('details');
      menu.className = 'sc-mobile-menu';
      summary = document.createElement('summary');
      summary.textContent = 'Menu';
      var panel = document.createElement('div');
      panel.className = 'sc-mobile-panel';
      menu.append(summary, panel);
      row.append(menu);
      header.classList.add('sc-mobile-ready');
      function updateNavigation() {
        closeMenu(false);
        if (mobile.matches) {
          panel.append(nav);
          if (social) panel.append(social);
        } else {
          navHome.after(nav);
          if (social) socialHome.after(social);
        }
      }
      updateNavigation();
      mobile.addEventListener('change', updateNavigation);
      panel.addEventListener('click', function (event) {
        if (event.target.closest('a')) closeMenu(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && menu.open) {
          event.preventDefault();
          closeMenu(true);
        }
      });
      document.addEventListener('click', function (event) {
        if (!menu.contains(event.target)) closeMenu(false);
      });
    }
  }

  // Keep the original nodes, disclosure and form fields intact across breakpoints.
  var grid = document.querySelector('.sales-contact-grid');
  var card = grid && grid.querySelector('.sales-contact-form');
  var intro = grid && grid.querySelector('.sales-contact-intro');
  var note = intro && intro.querySelector('.sales-consult-note');
  if (card && intro) {
    var noteHome = note && document.createComment('Desktop consultation disclosure');
    if (note) note.before(noteHome);
    function updateContactOrder() {
      if (mobile.matches) {
        grid.prepend(card);
        if (note) card.querySelector('form').before(note);
      } else {
        grid.append(card);
        if (note) noteHome.after(note);
      }
    }
    updateContactOrder();
    mobile.addEventListener('change', updateContactOrder);
  }

  function contactLocation(link) {
    if (link.closest('.mobile-sticky-cta, .mobile-action-bar, .wisp-mobile-cta')) return 'mobile_bar';
    if (link.closest('.sc-contact-strip, .sc-header')) return 'header';
    if (link.closest('footer')) return 'footer';
    if (link.closest('#contact')) return 'contact';
    if (link.closest('[class*="hero"]')) return 'hero';
    return 'content';
  }

  function contactTag() {
    // Pages without a base tag load it only when someone uses a contact link.
    if (typeof window.gtag !== 'function') {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', 'AW-17992501324', { send_page_view: false });
      if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=AW-17992501324';
        document.head.append(script);
      }
    }
    return window.gtag;
  }

  // One delegated handler covers all tel/sms links, including links in the menu.
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var action = /^tel:/i.test(href) ? 'phone_click' : /^sms:/i.test(href) ? 'text_click' : '';
    if (!action) return;
    try {
      var tag = contactTag();
      tag('event', action, {
        event_category: 'contact',
        event_label: action,
        link_location: contactLocation(link),
        transport_type: 'beacon'
      });
      if (action === 'phone_click') {
        tag('event', 'conversion', {
          send_to: 'AW-17992501324/rt-XCLrMoa8cEMyQv4ND',
          value: 1.0,
          currency: 'USD',
          transport_type: 'beacon'
        });
      }
    } catch (error) {
      // Analytics must never prevent the normal phone or messaging action.
    }
  });
})();
