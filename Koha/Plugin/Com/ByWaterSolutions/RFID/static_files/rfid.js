console.log("RFID Plugin loaded");

let rfid_type = undefined;
let loaded_rfid_message_boxes = false;

// Override storage functions to update the UI
const originalSetUnprocessedBarcodes = set_unprocessed_barcodes;
set_unprocessed_barcodes = function (barcodes) {
  originalSetUnprocessedBarcodes(barcodes);
  if ($('#rfid-barcode-list').length) {
    updateBarcodeList();
  }
};

const originalSetProcessedBarcodes = set_processed_barcodes;
set_processed_barcodes = function (barcodes) {
  originalSetProcessedBarcodes(barcodes);
  if ($('#rfid-processed-barcode-list').length) {
    updateProcessedBarcodeList();
  }
};

// RFID Vendor API abstraction
const rfidVendor = {
  vendors: {
    mksolutions: {
      name: 'mksolutions',
      baseUrl: "http://127.0.0.1:4039/mkStaffStationAPI",
      init: function () {
      },
      checkAlive: async function () {
        try {
          console.log(`Checking MK Solutions RFID reader status at ${this.baseUrl}/getItems`);
          const xml = await $.ajax({
            url: `${this.baseUrl}/getItems`,
            dataType: "xml"
          });
          console.log(`MK Solutions RFID reader check successful: ${xml}`);
          return xml ? true : false;
        } catch (error) {
          console.log(`${this.name} RFID reader check failed:`, error);
          return false;
        }
      },
      getItems: async function () {
        return $.ajax({
          url: `${this.baseUrl}/getItems`,
          dataType: "xml",
        }).then(function (xml) {
          console.log("MK Solutions getItems response:", xml);
          const result = {
            status: true,
            items: []
          };

          // Process each item in the XML
          $(xml).find('item').each(function () {
            console.log("Processing item:", $(this));
            const barcode = $(this).find('barcode').text();
            console.log("Barcode:", barcode);
            const isSecure = $(this).find('is_secure').text().toLowerCase() === 'true';
            console.log("Is secure:", isSecure);

            result.items.push({
              barcode: barcode,
              security: isSecure
            });
          });

          console.log("Processed items:", result);
          return result;
        }).fail(function (xhr, status, error) {
          console.error("Error fetching items from MK Solutions:", status, error);
          return { items: [] };  // Return empty items on error
        });
      },
      setSecurityBit: function (barcode, bitValue) {
        return $.ajax({
          url: `${this.baseUrl}/setSecurity`,
          dataType: "xml",
          contentType: "text/xml",
          async: false,
          method: "PUT",
          data: `<rfid><barcode>${barcode}</barcode><is_secure>${bitValue}</is_secure></rfid>`
        });
      }
    },
    circit: {
      name: 'circit',
      port: TechLogicCircItNonAdministrativeMode
        ? "80/Temporary_Listen_Addresses"
        : TechLogicCircItPort
          ? TechLogicCircItPort
          : "9201",
      baseUrl: "",
      init: function () {
        this.baseUrl = `http://localhost:${this.port}`;
      },
      checkAlive: async function () {
        try {
          console.log(`Checking CIRCIT RFID reader status at ${this.baseUrl}/alive`);
          const response = await $.getJSON(`${this.baseUrl}/alive`);
          return response.status === true && response.statuscode === 0;
        } catch (error) {
          console.log(`CIRCIT RFID reader check failed:`, error);
          return false;
        }
      },
      getItems: function () {
        return $.getJSON(`${this.baseUrl}/getitems`);
      },
      setSecurityBit: function (barcode, bitValue) {
        return $.ajax({
          url: `${this.baseUrl}/setsecurity/${barcode}/${bitValue}`,
          dataType: "json",
          async: false
        });
      }
    }
  },

  // Initialize the RFID vendor
  init: async function () {
    console.log("INITIALIZING RFID VENDOR");
    // Try to detect which vendor is available
    for (const [vendorName, vendor] of Object.entries(this.vendors)) {
      try {
        console.log(`Checking ${vendorName}`);

        vendor.init();

        const isAlive = await vendor.checkAlive();
        console.log(`Is ${vendorName} RFID reader alive?`, isAlive);

        if (isAlive) {
          this.currentVendor = vendor;
          console.log(`Using ${vendorName} RFID reader at ${vendor.baseUrl}`);
          return true;
        }
      } catch (error) {
        console.error(`Error initializing ${vendorName}:`, error);
      }
    }

    console.error('No supported RFID reader found');
    display_rfid_failure();
    return false;
  },

  // Proxy methods to the current vendor
  checkAlive: function () {
    return this.currentVendor ? this.currentVendor.checkAlive() : Promise.resolve(false);
  },

  /*
  * The expected return format for a vendor's getItems is:
  {
    "items": [
      {
        "barcode": "2",
        "security": false
      },
      {
        "barcode": "5",
        "security": false
      },
      {
        "barcode": "3",
        "security": false
      }
    ]
  }
  */
  getItems: function () {
    if (!this.currentVendor) {
      return $.Deferred().reject('No RFID reader available').promise();
    }
    return this.currentVendor.getItems();
  },

  setSecurityBit: function (barcode, bitValue) {
    if (!this.currentVendor) {
      return $.Deferred().reject('No RFID reader available').promise();
    }
    return this.currentVendor.setSecurityBit(barcode, bitValue);
  }
};

async function detect_rfid_interface() {
  const is_circit = await detect_rfid_type_techlogic_circit();
  if (is_circit) {
    console.log('TechLogic CircIt detected');
    return 'techlogic_circit';
  } else {
    console.log('TechLogic CircIt not detected');
  }

  display_rfid_failure();
  return undefined;
}

// Sometimes we need to halt processing on non-batch pages and continue after the issue has been resolved
let continue_processing = false;
let intervalID = "";

$(document).ready(async function () {
  // Initialize the RFID vendor
  await rfidVendor.init().then(initialized => {
    if (!initialized) {
      display_rfid_failure();
    }
  });

  // Checkin option on the top bar
  $("#checkin_search-tab,a[href='#checkin_search']").on("click", function () {
    handle_action_change("checkin");
    handle_one_at_a_time("checkin", "enable", $("#ret_barcode"));
  });

  // Renewal option on the top bar
  $("#renew_search-tab,a[href='#renew_search']").on("click", function () {
    handle_action_change("renew");
    handle_one_at_a_time("checkin", "enable", $("#ren_barcode"));
  });

  // Catalog search on the top bar
  $("#catalog_search-tab").on("click", function () {
    handle_action_change("search");

    let action = "search";
    let security_setting = "ignore";
    let barcode_input = $("#search-form");
    let form_submit = $("#cat-search-block button");
    let auto_submit_test_cb = () => {
      return true; //FIXME: Make a plugin setting
    };
    handle_one_and_done(
      action,
      security_setting,
      barcode_input,
      form_submit,
      auto_submit_test_cb
    );
  });

  handle_visibility();
});

function handle_tab_inactive() {
  if (intervalID) {
    clearInterval(intervalID);
    intervalID = null;
  }
}

function initUserInterface() {
  initFloatingResetButton();
  initFloatingBarcodeBox();
}

function handle_tab_active() {
  initiate_rfid_scanning();
}

function handle_visibility() {
  if (document.hidden) {
    handle_tab_inactive();
  } else {
    handle_tab_active();
  }
}
document.addEventListener("visibilitychange", handle_visibility);

function handle_one_at_a_time(
  action,
  security_setting,
  barcode_input,
  form_submit,
  submit_form_automatically
) {
  console.log("handle_one_at_a_time");

  let halt = false;

  // Some dialogs have their own buttons and the "Continue processing" button is not needed
  let show_continue_processing_button = true;

  barcode_input = barcode_input ? barcode_input : $("#barcode");
  form_submit = form_submit
    ? form_submit
    : barcode_input.closest("form").find(":submit");

  const dialog_alert_message = $("div.alert");

  //TODO: Make this list configurable from the plugin interface
  if (
    $("#hold-found1").length ||
    $("#hold-found2").length ||
    $("#item-transfer-modal").length ||
    $("#restricted_backdated").length ||
    $("#transfer-trigger").length ||
    $("#wrong-branch-modal").length ||
    $("p.problem.ret_badbarcode").length ||
    $("p.problem.ret_blocked").length ||
    $("p.problem.ret_charged").length ||
    $("p.problem.ret_datacorrupt").length ||
    $("p.problem.ret_ispermenant").length ||
    $("p.problem.ret_refund").length ||
    $("p.problem.ret_restored").length ||
    $("p.problem.ret_withdrawn").length ||
    $("p.ret_checkinmsg").length
  ) {
    halt = true;
  }

  if (action == "renew" && $("button.approve").length) {
    console.log("HALTING FOR RENEWAL APPROVAL");
    halt = true;
    show_continue_processing_button = false;
  }

  if ($("#wrong-transfer-modal").length && !continue_processing) {
    console.log("WRONG TRANSFER");
    // Do nothing, the built in modal will reload the page when a button in it is clicked
  } else if (
    $("#circ-needsconfirmation-modal").length &&
    !continue_processing
  ) {
    console.log("NEEDS CONFIRMATION");
    const button = $("#circ-needsconfirmation-modal button.deny");
    button.on("click", function () {
      continue_processing = true;
      initiate_rfid_scanning();
    });
  } else if (halt && !continue_processing) {
    console.log("HALTING FOR PROBLEM MESSAGE");
    if (show_continue_processing_button) {
      const btn = `<button class="rfid-continue">Continue processing RFID tags</button>`;
      dialog_alert_message.append(btn);
      dialog_alert_message.on("click", "button.rfid-continue", function () {
        $("button.rfid-continue").hide();
        continue_processing = true;
        handle_one_at_a_time(
          action,
          security_setting,
          barcode_input,
          form_submit,
          submit_form_automatically
        );
      });
    }
  } else if (barcode_input.length) {
    // For one at a time pages, we can keep processing the current unproccessed items
    // once that list is empty we go looking for more items on the RFID pad
    let unprocessed_barcodes = get_unprocessed_barcodes();

    if (unprocessed_barcodes.length) {
      const barcode = unprocessed_barcodes.pop();

      set_unprocessed_barcodes(unprocessed_barcodes);
      add_processed_barcode(barcode);

      set_security_and_submit_single_barcode(
        barcode,
        action,
        security_setting,
        barcode_input,
        form_submit,
        submit_form_automatically
      );
    } else {
      // We have no unprocessed barcodes, let us look for some on the RFID pad

      poll_rfid_for_barcodes_batch(function (data) {
        let unprocessed_barcodes = get_unprocessed_barcodes();
        console.log("UNPROCESSED BARCODES: ", unprocessed_barcodes);

        let rfid_pad_barcodes = data.items.map(function (item) {
          return item.barcode;
        });
        console.log("NEW BARCODES: ", rfid_pad_barcodes);

        let processed_barcodes = get_processed_barcodes();

        let combined_barcodes = combine_barcodes(
          rfid_pad_barcodes,
          unprocessed_barcodes,
          processed_barcodes
        );
        console.log("COMBINED BARCODES: ", combined_barcodes);

        const barcode = combined_barcodes.pop();
        if (barcode) {
          set_unprocessed_barcodes(combined_barcodes);
          add_processed_barcode(barcode);

          set_security_and_submit_single_barcode(
            barcode,
            action,
            security_setting,
            barcode_input,
            form_submit,
            submit_form_automatically
          );
        } else {
          console.log("NO BARCODE TO PROCESS");
          // Start again, librarian may put new stack of items on the RFID pad
          handle_one_at_a_time(action, security_setting);
        }
      }, true); // The 'true' enables the 'no wait' option for 'one at a time' processing
    }
  }
}

function set_security_and_submit_single_barcode(
  barcode,
  action,
  security_setting,
  barcode_input,
  form_submit,
  submit_form_automatically
) {
  barcode_input.val(barcode);
  if (security_setting == "enable" || security_setting == "disable") {
    const security_flag_value = security_setting == "enable" ? true : false;

    console.log("ALTERING SECURITY BITS");
    const r = alter_security_bits([barcode], security_flag_value).then(
      function () {
        console.log("ALTERING SECURITY BITS COMPLETED");
        form_submit.click();
      }
    );
  } else {
    // No change in RFID security bits
    if (submit_form_automatically) {
      form_submit.click();
    }
  }
}

function initiate_rfid_scanning() {
  rfidVendor.getItems().then(function (data) {
    if (data.status === true) {
      detect_and_handle_rfid_for_page(data);
    } else {
      console.log("No items found on RFID reader");
    }
  }, function () {
    display_rfid_failure();
  });
}

function detect_and_handle_rfid_for_page(data) {
  console.log("detect_and_handle_rfid_for_page");
  const current_action = get_current_action();
  const previous_action = get_previous_action();

  if (current_action != previous_action) {
    console.log("ACTION HAS CHANGED");
    handle_action_change();
  }

  set_previous_action(current_action);

  if (current_action && !loaded_rfid_message_boxes) {
    initUserInterface();
    loaded_rfid_message_boxes = true;
  }

  console.log("CURRENT ACTION:", current_action);
  if (current_action) {
    switch (current_action) {
      case "batch_checkout":
        handle_batch(current_action, "disable");
        break;
      case "checkout":
        handle_one_at_a_time(current_action, "disable");
        break;
      case "checkin":
        handle_one_at_a_time(current_action, "enable");
        break;
      case "renew":
        handle_one_at_a_time(current_action, "disable", $('[name="barcode"]'));
        break;
      case "list_add_items":
        handle_batch(current_action, "ignore", $("#barcodes"), "", function () {
          return false;
        });
        break;
      case "batch_item_modification":
        // Reset the seen items for each batch run
        handle_action_change(current_action);
        handle_batch(
          current_action,
          "ignore",
          $("#barcodelist"),
          "",
          function () {
            return false;
          }
        );
        break;
      case "inventory":
        handle_batch(
          current_action,
          "ignore",
          $("#barcodelist"),
          "",
          function () {
            return false;
          }
        );
        break;
      case "quick-spine-label":
        handle_one_and_done(
          current_action,
          "ignore",
          $("#barcode"),
          "",
          function () {
            return false;
          }
        );
        break;
      case "transfer":
        handle_one_at_a_time(current_action, "disable");
        break;
      default:
        console.log(`ERROR: Action ${action} has no handler!`);
    }
  }
}

// We have gone from one action to another
// e.g. from checkout to checkin, or batch checkout to batch item modifer
// Clear out the queued up barcodes and start fresh
function handle_action_change(action) {
  console.log("handle_action_change");

  action = action ? action : "";

  if (intervalID) {
    clearInterval(intervalID);
    intervalID = null;
  }

  set_previous_action(action);
  set_unprocessed_barcodes([]);
  set_processed_barcodes([]);
}

function get_current_action() {
  const href = window.location.href;
  if (href.indexOf("circulation.pl") > -1) {
    if ($("h1:contains(Batch check out)").length) {
      return "batch_checkout";
    } else {
      return "checkout";
    }
  } else if (href.indexOf("returns.pl") > -1) {
    return "checkin";
  } else if (href.indexOf("circ/renew.pl") > -1) {
    return "renew";
  } else if (href.indexOf("virtualshelves/shelves.pl") > -1) {
    return "list_add_items";
  } else if (href.indexOf("batchMod.pl") > -1) {
    return "batch_item_modification";
  } else if ($("#barcodelist").length && href.indexOf("inventory.pl") > -1) {
    return "inventory";
  } else if (href.indexOf("spinelabel-home.pl") > -1) {
    return "quick-spine-label";
  } else if (href.indexOf("branchtransfers.pl") > -1) {
    return "transfer";
  }
}

function set_previous_action(action) {
  localStorage.setItem("koha_plugin_rfid_previous_action", action);
}

function get_previous_action() {
  return localStorage.getItem("koha_plugin_rfid_previous_action");
}

function set_unprocessed_barcodes(barcodes) {
  return localStorage.setItem(
    "koha_plugin_rfid_unprocessed_barcodes",
    JSON.stringify(barcodes)
  );
}

function get_unprocessed_barcodes() {
  console.log("get_unprocessed_barcodes");
  const barcodes_json = localStorage.getItem(
    "koha_plugin_rfid_unprocessed_barcodes"
  );
  console.log("UNPROCESSED BARCODES JSON: ", barcodes_json);
  let barcodes = barcodes_json ? JSON.parse(barcodes_json) : [];
  return barcodes;
}

function get_processed_barcodes() {
  console.log("get_processed_barcodes");
  const barcodes_json = localStorage.getItem(
    "koha_plugin_rfid_processed_barcodes"
  );
  console.log("PROCESSED BARCODES JSON: ", barcodes_json);
  let barcodes = barcodes_json ? JSON.parse(barcodes_json) : [];
  return barcodes;
}

function set_processed_barcodes(barcodes) {
  return localStorage.setItem(
    "koha_plugin_rfid_processed_barcodes",
    JSON.stringify(barcodes)
  );
}

function add_processed_barcode(barcode) {
  let barcodes = get_processed_barcodes();

  if (barcodes.includes(barcode)) {
    return false;
  } else {
    barcodes.push(barcode);
    set_processed_barcodes(barcodes);
    return true;
  }
}

function display_rfid_failure() {
  console.log("NO RFID READER FOUND");
}

// This function is for pages where bacodes cannot be run in batch *or* scanned repeatedly.
// A good example of this is the barcode image generator
function handle_one_and_done(
  action,
  security_setting,
  barcode_input,
  form_submit,
  auto_submit_test_cb
) {
  console.log("handle_one_and_done");

  console.log(barcode_input);
  if (!barcode_input) {
    barcode_input = $("#barcode");
  }

  if (barcode_input.length) {
    poll_rfid_for_barcodes_batch(function (data) {
      let barcodes = data.items.map(function (item) {
        return item.barcode;
      });
      console.log("BARCODES: ", barcodes);

      if (barcodes.length > 1) {
        alert(
          "More than one RFID tag is on the reader. Please remove all but one RFID tag and click 'OK'"
        );
        handle_one_and_done(
          action,
          security_setting,
          barcode_input,
          form_submit,
          auto_submit_test_cb
        );
      } else {
        barcode_input.val(barcodes[0]);

        const submit_form_automatically = auto_submit_test_cb
          ? auto_submit_test_cb(
            action,
            security_setting,
            barcode_input,
            form_submit
          )
          : true;

        if (security_setting == "enable" || security_setting == "disable") {
          const security_flag_value =
            security_setting == "enable" ? true : false;
          const r = alter_security_bits(barcodes, security_flag_value).then(
            function () {
              if (submit_form_automatically) {
                form_submit.click();
              }
            }
          );
        } else {
          // No change in RFID security bits
          if (submit_form_automatically) {
            form_submit.click();
          }
        }
      }
    });
  }
}

function combine_barcodes(
  rfid_pad_barcodes,
  unprocessed_barcodes,
  processed_barcodes
) {
  console.log("combine_barcodes");
  // Add the barcodes on the rfid pad to the currently uprocessed barcode
  let combined_barcodes = unprocessed_barcodes.concat(
    rfid_pad_barcodes.filter(item => unprocessed_barcodes.indexOf(item) < 0)
  );
  console.log(
    "COMBINED UNPROCESSED AND RFID PAD BARCODES: ",
    combined_barcodes
  );
  // Then remove out any barcodes we have already seen
  combined_barcodes = combined_barcodes.filter(
    el => !processed_barcodes.includes(el)
  );
  console.log("COMBINED BARCODES WITH PROCESSED BARCODES REMOVED");

  return combined_barcodes;
}

function handle_batch(
  action,
  security_setting,
  barcodes_textarea,
  form_submit,
  auto_submit_test_cb
) {
  console.log("handle_batch");

  if (!barcodes_textarea) {
    barcodes_textarea = $("#barcodelist");
  }

  if (barcodes_textarea.length) {
    poll_rfid_for_barcodes_batch(function (data) {
      let barcodes = data.items.map(function (item) {
        return item.barcode;
      });

      if (!form_submit) {
        form_submit = barcodes_textarea.closest("form").find(":submit");
      }

      // The function add_processed_barcode will return false if the barcode has already been added to the processed list
      let unseen_barcodes = [];
      for (const b of barcodes) {
        if (add_processed_barcode(b)) {
          unseen_barcodes.push(b);
        }
      }

      barcodes_textarea.val(
        barcodes_textarea.val() + unseen_barcodes.join("\r\n") + "\r\n"
      );

      const submit_form_automatically = auto_submit_test_cb
        ? auto_submit_test_cb(
          action,
          security_setting,
          barcodes_textarea,
          form_submit
        )
        : true;

      if (security_setting == "enable" || security_setting == "disable") {
        const security_flag_value = security_setting == "enable" ? true : false;
        const r = alter_security_bits(barcodes, security_flag_value).then(
          function () {
            if (submit_form_automatically) {
              form_submit.click();
            } else {
              // Start looking for more barcodes, allows multiple stacks of items to be dropped on rfid pad in turn
              handle_batch(
                action,
                security_setting,
                barcodes_textarea,
                form_submit,
                auto_submit_test_cb
              );
            }
          }
        );
      } else {
        // No change in RFID security bits
        if (submit_form_automatically) {
          form_submit.click();
        } else {
          // Start looking for more barcodes, allows multiple stacks of items to be dropped on rfid pad in turn
          handle_batch(
            action,
            security_setting,
            barcodes_textarea,
            form_submit,
            auto_submit_test_cb
          );
        }
      }
    });
  }
}

let alter_security_bits = async (barcodes, bit_value) => {
  console.log("alter_security_bits", barcodes, bit_value);
  barcodes.forEach(each => {
    rfidVendor.setSecurityBit(each, bit_value).done(function (data) {
      console.log("setsecurity RETURNED", data);
      return data;
    }).fail(function (data) {
      console.log("Failed to set security bits for", each, data);
      return false;
    });
  });
};

function poll_rfid_for_barcodes_batch(cb, no_wait) {
  console.log("poll_rfid_for_barcodes_batch", cb);
  let items_count = 0;

  intervalID = setInterval(function () {
    rfidVendor.getItems().then(function (data) {
      console.log(data);
      if (data.items && data.items.length) {
        // We have at least one item on the pad
        if (items_count > 0) {
          // RFID Service provides debouncing of items on antenna, no need to
          // do that here as it adds additional delays in reporting item IDs
          clearInterval(intervalID);
          console.log(
            "ITEMS HAVE SETTLED, FINISHED WAITING, INITIATING CALLBACK"
          );
          cb(data);
        } else {
          items_count = data.items.length;
        }
      } else if (data && data.items && data.items.length && no_wait) {
        clearInterval(intervalID);
        console.log("NO WAIT ENABLED, INTIATED CALLBACK");
        cb(data);
      }
    });
  }, 500);
  console.log("INTERVAL ID:", intervalID);
  return intervalID;
}

// Create and initialize the floating box UI
function initFloatingResetButton() {
  // Create the floating reset button
  const $reset_box = $(`
        <div id="rfid-reset-box" style="
            position: fixed;
            bottom: 20px;  
            right: 20px;  
            background: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 9998;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        ">
            <div style="
                background: #f8f9fa;
                padding: 8px 15px;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            ">
                <strong>RFID Controls</strong>
                <div>
                    <button class="rfid-reset-toggle" style="
                        background: none;
                        border: none;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 0 5px;
                    ">−</button>
                    <button class="rfid-reset-close" style="
                        background: none;
                        border: none;
                        color: #dc3545;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 0 5px;
                    ">×</button>
                </div>
            </div>
            <div id="rfid-reset-content" style="padding: 15px; transition: all 0.3s ease;">
                <button id="rfid-reset-button" class="btn btn-danger w-100">
                    <i class="fa fa-refresh" aria-hidden="true"></i> Reset RFID
                </button>
            </div>
        </div>
    `).appendTo('body');

  // Make draggable
  let isDragging = false;
  let offsetX, offsetY;

  $reset_box.find('> div').first().on('mousedown', function (e) {
    if (e.target.tagName === 'BUTTON') return;

    isDragging = true;
    offsetX = e.clientX - $reset_box[0].getBoundingClientRect().left;
    offsetY = e.clientY - $reset_box[0].getBoundingClientRect().top;
    $reset_box.css('cursor', 'grabbing');
    e.preventDefault();
  });

  $(document).on('mousemove', function (e) {
    if (!isDragging) return;

    $reset_box.css({
      left: e.clientX - offsetX + 'px',
      top: e.clientY - offsetY + 'px',
      bottom: 'auto',
      right: 'auto'
    });
  });

  $(document).on('mouseup', function () {
    isDragging = false;
    $reset_box.css('cursor', 'grab');
  });

  // Toggle visibility
  $reset_box.on('click', '.rfid-reset-toggle', function (e) {
    e.stopPropagation();
    const $content = $('#rfid-reset-content');
    const $toggle = $(this);

    if ($content.is(':visible')) {
      $content.slideUp(200);
      $toggle.text('+');
      // Store preference
      localStorage.setItem('koha_plugin_rfid_show_reset_box', 'false');
    } else {
      $content.slideDown(200);
      $toggle.text('−');
      // Store preference
      localStorage.setItem('koha_plugin_rfid_show_reset_box', 'true');
    }
  });

  // Close button
  $reset_box.on('click', '.rfid-reset-close', function (e) {
    e.stopPropagation();
    $reset_box.remove();
    localStorage.setItem('koha_plugin_rfid_show_reset_box', 'false');
  });

  // Add click handler for the reset button
  $reset_box.on('click', '#rfid-reset-button', function (e) {
    e.stopPropagation();
    handle_action_change("");
    initiate_rfid_scanning();
  });

  // Check if the box was previously closed
  if (localStorage.getItem('koha_plugin_rfid_show_reset_box') === 'false') {
    $reset_box.find('#rfid-reset-content').hide();
    $reset_box.find('.rfid-reset-toggle').text('+');
  }

  return $reset_box;
}

function initFloatingBarcodeBox() {
  // Create the floating container
  const $barcode_box = $(`
        <div id="rfid-barcode-box" style="
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 350px;
            max-height: 500px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        ">
            <div style="
                background: #f8f9fa;
                padding: 8px 15px;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            ">
                <strong>RFID Barcodes</strong>
                <div>
                    <button id="rfid-box-toggle" style="
                        background: none;
                        border: none;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 0 5px;
                    ">−</button>
                    <button id="rfid-box-close" style="
                        background: none;
                        border: none;
                        color: #dc3545;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 0 5px;
                    ">×</button>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="nav nav-tabs" id="barcodeTabs" role="tablist" style="padding: 5px 10px 0; border-bottom: none;">
                <button class="nav-link active" id="unprocessed-tab" data-bs-toggle="tab" data-bs-target="#unprocessed-content" type="button" role="tab" style="
                    padding: 5px 10px;
                    border: 1px solid #dee2e6;
                    border-bottom: none;
                    border-radius: 4px 4px 0 0;
                    background: #fff;
                    color: #495057;
                    margin-right: 5px;
                ">
                    Unprocessed <span id="unprocessed-count" class="badge bg-primary rounded-pill">0</span>
                </button>
                <button class="nav-link" id="processed-tab" data-bs-toggle="tab" data-bs-target="#processed-content" type="button" role="tab" style="
                    padding: 5px 10px;
                    border: 1px solid #dee2e6;
                    border-bottom: none;
                    border-radius: 4px 4px 0 0;
                    background: #f8f9fa;
                    color: #495057;
                ">
                    Processed <span id="processed-count" class="badge bg-secondary rounded-pill">0</span>
                </button>
            </div>
            
            <!-- Tab content -->
            <div class="tab-content" style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column;">
                <!-- Unprocessed barcodes tab -->
                <div class="tab-pane fade show active" id="unprocessed-content" role="tabpanel" style="flex-grow: 1; overflow-y: auto;">
                    <div id="rfid-barcode-list" style="padding: 10px;">
                        <div class="text-muted text-center py-2">No unprocessed barcodes</div>
                    </div>
                </div>
                
                <!-- Processed barcodes tab -->
                <div class="tab-pane fade" id="processed-content" role="tabpanel" style="flex-grow: 1; overflow-y: auto;">
                    <div id="rfid-processed-barcode-list" style="padding: 10px;">
                        <div class="text-muted text-center py-2">No processed barcodes</div>
                    </div>
                </div>
            </div>
        </div>
    `);

  // Add to body
  $('body').append($barcode_box);

  // Make draggable
  let isDragging = false;
  let offsetX, offsetY;

  $barcode_box.find('div').first().on('mousedown', function (e) {
    if (e.target.tagName === 'BUTTON') return;

    isDragging = true;
    offsetX = e.clientX - $barcode_box[0].getBoundingClientRect().left;
    offsetY = e.clientY - $barcode_box[0].getBoundingClientRect().top;
    $barcode_box.css('cursor', 'grabbing');
    e.preventDefault();
  });

  $(document).on('mousemove', function (e) {
    if (!isDragging) return;

    $barcode_box.css({
      left: e.clientX - offsetX + 'px',
      top: e.clientY - offsetY + 'px',
      bottom: 'auto',
      right: 'auto'
    });
  });

  $(document).on('mouseup', function () {
    isDragging = false;
    $barcode_box.css('cursor', 'grab');
  });

  // Toggle visibility
  $('#rfid-box-toggle').on('click', function () {
    const $list = $('#rfid-barcode-list');
    console.log("TEST TEST TEEST TEST")
    if ($list.is(':visible')) {
      console.log("HIDING");
      $list.hide();
      $(this).text('+');
      // Store preference to not show again
      localStorage.setItem('koha_plugin_rfid_show_barcode_box', 'false');
    } else {
      console.log("SHOWING");
      $list.show();
      $(this).text('−');
    }
  });

  // Close button
  $('#rfid-box-close').on('click', function () {
    //FIXME: Add a way to remove the floating box and bring it back later
    //$barcode_box.remove();
  });

  // Initial updates
  updateBarcodeList();
  updateProcessedBarcodeList();
}

// Update the unprocessed barcode list in the floating box
function updateBarcodeList() {
  const barcodes = get_unprocessed_barcodes();
  const $list = $('#rfid-barcode-list');

  // Update count badge
  $('#unprocessed-count').text(barcodes.length);

  if (!barcodes || barcodes.length === 0) {
    $list.html('<div class="text-muted text-center py-2">No unprocessed barcodes</div>');
    return;
  }

  const html = `
        <div class="list-group" style="max-height: 350px; overflow-y: auto;">
            ${barcodes.map(barcode => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span class="font-monospace">${barcode}</span>
                    <div>
                        <button class="btn btn-sm btn-outline-success process-barcode" data-barcode="${barcode}" title="Mark as processed">✓</button>
                        <button class="btn btn-sm btn-outline-danger remove-barcode" data-barcode="${barcode}" title="Remove">×</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

  $list.html(html);

  // Add click handler for remove buttons
  $('.remove-barcode').on('click', function (e) {
    e.stopPropagation();
    const barcodeToRemove = $(this).data('barcode');
    const currentBarcodes = get_unprocessed_barcodes();
    const updatedBarcodes = currentBarcodes.filter(b => b !== barcodeToRemove);
    set_unprocessed_barcodes(updatedBarcodes);
    updateBarcodeList();
  });

  // Add click handler for process buttons
  $('.process-barcode').on('click', function (e) {
    e.stopPropagation();
    const barcodeToProcess = $(this).data('barcode');
    const currentUnprocessed = get_unprocessed_barcodes();
    const updatedUnprocessed = currentUnprocessed.filter(b => b !== barcodeToProcess);
    set_unprocessed_barcodes(updatedUnprocessed);
    add_processed_barcode(barcodeToProcess);
    updateBarcodeList();
    updateProcessedBarcodeList();
  });
}

// Update the processed barcode list in the floating box
function updateProcessedBarcodeList() {
  const barcodes = get_processed_barcodes();
  const $list = $('#rfid-processed-barcode-list');

  // Update count badge
  $('#processed-count').text(barcodes.length);

  if (!barcodes || barcodes.length === 0) {
    $list.html('<div class="text-muted text-center py-2">No processed barcodes</div>');
    return;
  }

  // Show most recently processed items first
  const reversedBarcodes = [...barcodes].reverse();

  const html = `
        <div class="list-group" style="max-height: 350px; overflow-y: auto;">
            ${reversedBarcodes.map(barcode => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span class="font-monospace">${barcode}</span>
                    <span class="badge bg-success">Processed</span>
                </div>
            `).join('')}
        </div>
    `;

  $list.html(html);
}
