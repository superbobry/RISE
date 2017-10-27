/* -*- coding: utf-8 -*-
* ----------------------------------------------------------------------------
* Copyright (c) 2013-2017 Damián Avila and contributors.
*
* Distributed under the terms of the Modified BSD License.
*
* A Jupyter notebook extension to support *Live* Reveal.js-based slideshows.
* -----------------------------------------------------------------------------
*/

define([
        'require',
        'jquery',
        'base/js/namespace',
        'base/js/utils',
        'services/config',
], function(require, $, Jupyter, utils, configmod) {

/*
* Add customized config on top of the default options using the notebook metadata
* or the config-derived values
*/
function configSlides() {

  var default_config = {};

  var config_section = new configmod.ConfigSection('livereveal',
                              {base_url: utils.get_body_data("baseUrl")});
  config_section.load();

  // dummy empty config section to load the metadata + default as a ConfigWithDefaults object
  var _config_section = new configmod.ConfigSection('_livereveal',
                              {base_url: utils.get_body_data("baseUrl")});
  _config_section.load();

  var final_config;

  var rise_meta = Jupyter.notebook.metadata.livereveal;

  if(rise_meta !== undefined && Object.keys(rise_meta).length > 0){
      final_config = $.extend(true, default_config, rise_meta);
      final_config = new configmod.ConfigWithDefaults(_config_section, final_config);
      console.log("RISE metadata detected. Using ONLY RISE metadata on top of the default config. Custom config disabled.")
  } else {
      final_config = new configmod.ConfigWithDefaults(config_section, default_config);
      console.log("No (or empty) RISE metadata. Using ONLY custom config (if exist) on top of the default config.")
  }

  return final_config

}

/*
* Version of get_cell_elements that will see cell divs at any depth in the HTML tree,
* allowing container divs, etc to be used without breaking notebook machinery.
* You'll need to make sure the cells are getting detected in the right order.
* NOTE: We use the Object prototype to workaround a firefox issue, check the following
* link to know more about the discussion leading to this use:
* https://github.com/damianavila/RISE/issues/117#issuecomment-127331816
*/
Object.getPrototypeOf(Jupyter.notebook).get_cell_elements = function () {
    return this.container.find("div.cell");
};

/* Use the slideshow metadata to rearrange cell DOM elements into the
 * structure expected by reveal.js
 */
function markupSlides(container) {
    // Machinery to create slide/subslide <section>s and give them IDs
    var slide_counter = -1, subslide_counter = -1;
    var slide_section, subslide_section;
    function new_slide() {
        slide_counter++;
        subslide_counter = -1;
        return $('<section>').appendTo(container);
    }
    function new_subslide() {
        subslide_counter++;
        return $('<section>').attr('id', 'slide-'+slide_counter+'-'+subslide_counter)
                .appendTo(slide_section);
    }

    // Containers for the first slide.
    slide_section = new_slide();
    subslide_section = new_subslide();
    var current_fragment = subslide_section;

    var selected_cell_idx = Jupyter.notebook.get_selected_index();
    var selected_cell_slide = [0, 0];

    // Special handling for the first slide: it will work even if the user
    // doesn't start with a 'Slide' cell. But if the user does explicitly
    // start with slide/subslide, we don't want a blank first slide. So we
    // don't create a new slide/subslide until there is visible content on
    // the first slide.
    var content_on_slide1 = false;

    var cells = Jupyter.notebook.get_cells();
    var i, cell, slide_type;

    for (i=0; i < cells.length; i++) {
        cell = cells[i];
        slide_type = (cell.metadata.slideshow || {}).slide_type;
        //~ console.log('cell ' + i + ' is: '+ slide_type);

        if (content_on_slide1) {
            if (slide_type === 'slide') {
                // Start new slide
                slide_section = new_slide();
                // In each subslide, we insert cells directly into the
                // <section> until we reach a fragment, when we create a div.
                current_fragment = subslide_section = new_subslide();
            } else if (slide_type === 'subslide') {
                // Start new subslide
                current_fragment = subslide_section = new_subslide();
            } else if (slide_type === 'fragment') {
                current_fragment = $('<div>').addClass('fragment')
                                    .appendTo(subslide_section);
            }
        } else if (slide_type !== 'notes' && slide_type !== 'skip') {
            // Subsequent cells should be able to start new slides
            content_on_slide1 = true;
        }

        // Record that this slide contains the selected cell
        if (i === selected_cell_idx) {
            selected_cell_slide = [slide_counter, subslide_counter];
        }

        // Move the cell element into the slide <section>
        // N.B. jQuery append takes the element out of the DOM where it was
        if (slide_type === 'notes') {
            // Notes are wrapped in an <aside> element
            subslide_section.append(
                $('<aside>').addClass('notes').append(cell.element)
            );
        } else {
            current_fragment.append(cell.element);
        }

        // Hide skipped cells
        if (slide_type === 'skip') {
            cell.element.addClass('reveal-skip');
        }
    }

    return selected_cell_slide;
}

/* Set the #slide-x-y part of the URL to control where the slideshow will start.
 * N.B. We do this instead of using Reveal.slide() after reveal initialises,
 * because that leaves one slide clearly visible on screen for a moment before
 * changing to the one we want. By changing the URL before setting up reveal,
 * the slideshow really starts on the desired slide.
 */
function setStartingSlide(selected) {
    // Start from the selected cell
    Reveal.slide(selected[0], selected[1]);
}

/* Setup the auto-launch function, which checks metadata to see if
*  RISE should launch automatically when the notebook is opened.
*/
function autoLaunch(config) {

  var autolaunch_promise = config.get('autolaunch');
  autolaunch_promise.then(function(autolaunch){
    if (autolaunch === true) {
          revealMode();
      }
  });

}

/* Setup a MutationObserver to call Reveal.sync when an output is generated.
 * This fixes issue #188: https://github.com/damianavila/RISE/issues/188
 */
var outputObserver = null;
function setupOutputObserver() {
  function mutationHandler(mutationRecords) {
    mutationRecords.forEach(function(mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length) {
        Reveal.sync();
      }
    });
  }

  var $output = $(".output");
  var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
  outputObserver = new MutationObserver(mutationHandler);

  var observerConfig = { childList: true, characterData: false, attributes: false, subtree: false };
  $output.each(function () {
    outputObserver.observe(this, observerConfig);
  });
}

function disconnectOutputObserver() {
  if (outputObserver !== null) {
    outputObserver.disconnect();
  }
}


function Revealer(selected_slide) {
  $('body').addClass("rise-enabled");
  // Prepare the DOM to start the slideshow
  $('div#header').hide();
  $('.end_space').hide();

  // Add the main reveal.js classes
  $('div#notebook').addClass("reveal");
  $('div#notebook-container').addClass("slides");

  // Header
  $('head')
  .prepend('<link rel="stylesheet" href='
  + require.toUrl("./reveal.js/css/theme/klu.css")
  + ' id="theme" />');
  // Add reveal css
  $('head')
  .prepend('<link rel="stylesheet" href='
  + require.toUrl("./reveal.js/css/reveal.css")
  + ' id="revealcss" />');

  // Tailer
  require(['./reveal.js/lib/js/head.min.js',
           './reveal.js/js/reveal.js'].map(require.toUrl),function(){
    // Full list of configuration options available here: https://github.com/hakimel/reveal.js#configuration

    var options = {
    // All this config option load correctly just because of require-indeced delay,
    // it would be better to catch them from the config.get promise.
    controls: false,
    progress: true,
    history: false,
    theme: 'klu',
    width: '100%',
    height: '100%',
    margin: 0.1,
    minScale: 1.0,
    transition: 'linear',
    transitionSpeed: 'fast',
    slideNumber: 'c/t',
    center: false,

    keyboard: {
    13: null, // Enter disabled
    27: function() { revealMode() },
    66: null, // b, black pause disabled, use period or forward slash
    72: null, // h, left disabled
    74: null, // j, down disabled
    75: null, // k, up disabled
    76: null, // l, right disabled
    78: null, // n, down disable
    79: null, // o disabled
    80: null, // p, up disable
    // 83: null, // s, notes, but not working because notes is a plugin
    },

    // Optional libraries used to extend on reveal.js
    // Notes are working partially... it opens the notebooks, not the slideshows...
    dependencies: [
            { src: require.toUrl("./reveal.js/lib/js/classList.js"), condition: function() { return !document.body.classList; } },
            { src: require.toUrl("./reveal.js/plugin/highlight/highlight.js"), async: true, callback: function() { hljs.initHighlightingOnLoad(); } },
            { src: require.toUrl("./reveal.js/plugin/notes/notes.js"), async: true, condition: function() { return !!document.body.classList; } }
        ]
    };

    Reveal.initialize();
    Reveal.configure(options);

    Reveal.addEventListener( 'ready', function( event ) {
      Unselecter();
    });

    Reveal.addEventListener( 'slidechanged', function( event ) {
      Unselecter();
    });

    // Sync when an output is generated.
    setupOutputObserver();

    // Setup the starting slide
    setStartingSlide(selected_slide);
    Unselecter();

  });
}

function Unselecter(){
  var cells = Jupyter.notebook.get_cells();
  for(var i in cells){
    var cell = cells[i];
    cell.unselect();
  }
}

function fixCellHeight(){
  // Let's start with all the cell unselected, the unselect the current selected one
  var scell = Jupyter.notebook.get_selected_cell()
  scell.unselect()
  // This select/unselect code cell triggers the "correct" heigth in the codemirror instance
  var cells = Jupyter.notebook.get_cells();
  for(var i in cells){
    var cell = cells[i];
    if (cell.cell_type === "code") {
      cell.select()
      cell.unselect();
    }
  }
}

function setupKeys(mode){
  // Lets setup some specific keys for the reveal_mode
  if (mode === 'reveal_mode') {
    // Prevent next cell after execution because it does not play well with the slides assembly
    Jupyter.keyboard_manager.command_shortcuts.set_shortcut("shift-enter", "jupyter-notebook:run-cell");
    Jupyter.keyboard_manager.edit_shortcuts.set_shortcut("shift-enter", "jupyter-notebook:run-cell");
    // Save the f keyboard event for the Reveal fullscreen action
    Jupyter.keyboard_manager.command_shortcuts.remove_shortcut("f");
    Jupyter.keyboard_manager.command_shortcuts.set_shortcut("shift-f", "jupyter-notebook:find-and-replace");
  } else if (mode === 'notebook_mode') {
    Jupyter.keyboard_manager.command_shortcuts.set_shortcut("shift-enter", "jupyter-notebook:run-cell-and-select-next");
    Jupyter.keyboard_manager.edit_shortcuts.set_shortcut("shift-enter", "jupyter-notebook:run-cell-and-select-next");
    Jupyter.keyboard_manager.command_shortcuts.remove_shortcut("shift-f");
    Jupyter.keyboard_manager.command_shortcuts.set_shortcut("f", "jupyter-notebook:find-and-replace");
  }
}

function removeHash() {
  history.pushState("", document.title, window.location.pathname
                                                     + window.location.search);
}

function Remover() {
  Reveal.configure({minScale: 1.0});
  Reveal.removeEventListeners();
  $('body').removeClass("rise-enabled");
  $('div#header').show();

  $('div#notebook').removeClass("reveal");
  // woekaround to fix fade class conflicting between notebook and reveal css...
  if ($('div#notebook').hasClass('fade')) { $('div#notebook').removeClass("fade"); };
  $('div#notebook-container').removeClass("slides");
  $('div#notebook-container').css('width','');
  $('div#notebook-container').css('height','');
  $('div#notebook-container').css('zoom','');

  $('#theme').remove();
  $('#revealcss').remove();

  $('.backgrounds').hide();
  $('.progress').hide();
  $('.controls').hide();
  $('.slide-number').hide();
  $('.speaker-notes').hide();
  $('.pause-overlay').hide();
  $('div#aria-status-div').hide();

  var cells = Jupyter.notebook.get_cells();
  for(var i in cells){
    $('.cell:nth('+i+')').removeClass('reveal-skip');
    $('div#notebook-container').append(cells[i].element);
  }

  $('div#notebook-container').children('section').remove();
  $('.end_space').show();

  disconnectOutputObserver();
  removeHash();
}

/* Just before exiting reveal mode, we run this function
 * whose job is to find the notebook index
 * for the first cell in the current (sub)slide
 * this allows to restore the notebook at the correct location,
 * i.e. with that cell being selected

 * we use the current URL that ends up in 'slide-n-m'
 * to find out about the slide and subslide */
function reveal_cell_index(notebook) {
  // last part of the current URL holds slide and subslide numbers
  var href = window.location.href;
  var chunks = href.split('-');
  var len = chunks.length;
  var slide = Number(chunks[len-2]);
  var subslide = Number(chunks[len-1]);

  // just scan all cells until we find one at that address
  // except that we need to start at -1 0r 0 depending on
  // whether the first slide has a slide tag or not
  var is_slide = function(cell) {
    return cell.metadata.slideshow
	&& cell.metadata.slideshow.slide_type == 'slide';
  }
  var is_subslide = function(cell) {
    return cell.metadata.slideshow
	&& cell.metadata.slideshow.slide_type == 'subslide';
  }
  var slide_counter = is_slide(notebook.get_cell(0)) ? -1 : 0;
  var subslide_counter = 0;
  var result = null;

  notebook.get_cells().forEach(function (cell, index) {
    if (result)
      // keep it short: skip if we found already
      return;
    if (is_slide(cell)) {
      slide_counter += 1;
      subslide_counter = 0;
    } else if (is_subslide(cell)) {
      subslide_counter += 1;
    }
    if ((slide_counter == slide) && (subslide_counter == subslide)) {
	result = index;
    }
  })
    return result;
}

function revealMode() {
  // We search for a class tag in the maintoolbar to check if reveal mode is "on".
  // If the tag exits, we exit. Otherwise, we enter the reveal mode.
  var tag = $('#maintoolbar').hasClass('reveal_tagging');

  if (!tag) {
    // Preparing the new reveal-compatible structure
    var selected_slide = markupSlides($('div#notebook-container'));
    // Adding the reveal stuff
    Revealer(selected_slide);
    // Minor modifications for usability
    setupKeys("reveal_mode");
    $('#maintoolbar').addClass('reveal_tagging');
  } else {
    var current_cell_index = reveal_cell_index(Jupyter.notebook);
    Remover();
    setupKeys("notebook_mode");
    $('#maintoolbar').removeClass('reveal_tagging');
    // Workaround... should be a better solution. Need to investigate codemirror
    fixCellHeight();
    // select and focus on current cell
    Jupyter.notebook.select(current_cell_index);
    // Need to delay the action a little bit so it actually focus the selected slide
    setTimeout(function(){ Jupyter.notebook.get_selected_cell().ensure_focused(); }, 1000);
  }
}

function setup() {
  $('head').append('<link rel="stylesheet" href=' + require.toUrl("./main.css") + ' id="maincss" />');

  Jupyter.toolbar.add_buttons_group([
    {
    'label'   : 'Enter/Exit Live Reveal Slideshow',
    'icon'    : 'fa-bar-chart-o',
    'callback': function(){ revealMode(); },
    'id'      : 'start_livereveal'
    },
  ]);
  var document_keydown = function(event) {
    if (event.which == 82 && event.altKey) {
      revealMode();
      return false;
    }
    return true;
  };
  $(document).keydown(document_keydown);

  // autolaunch if specified in metadata
  var config = configSlides()
  autoLaunch(config);
}

setup.load_ipython_extension = setup;

return setup;
});
