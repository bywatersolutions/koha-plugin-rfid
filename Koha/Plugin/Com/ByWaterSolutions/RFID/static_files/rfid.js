const circit_port = TechLogicCircItNonAdministrativeMode
  ? "80/Temporary_Listen_Addresses"
  : TechLogicCircItPort
    ? TechLogicCircItPort
    : "9201";
const circit_address = `http://localhost:${circit_port}`;

// Sometimes we need to halt processing on non-batch pages and continue after the issue has been resolved
let continue_processing = false;
let intervalID = "";

$(document).ready(function () {
  initiate_rfid_scanning();

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
      auto_submit_test_cb,
    );
  });

  //TODO: Should we restart rfid scanning ( initiate_rfid_scanning ) somehow? Or just require reloading the page?
});

function handle_one_at_a_time(
  action,
  security_setting,
  barcode_input,
  form_submit,
  submit_form_automatically,
) {
  console.log("handle_one_at_a_time");

  // Add a button to the buttom right to "reset" the list of seen barcodes
  var $button = $("<button>", {
    style:
      "position: fixed; bottom: 20px; right: 20px; background-color: red; color: white; font-weight: bold",
    id: "rfid-reset-button",
    text: "Reset RFID",
    click: function () {
      handle_action_change("");
      initiate_rfid_scanning();
    },
  });
  $("body").append($button);

  // Some dialogs have their own buttons and the "Continue processing" button is not needed
  let show_continue_processing_button = true;

  barcode_input = barcode_input ? barcode_input : $("#barcode");
  form_submit = form_submit
    ? form_submit
    : barcode_input.closest("form").find(":submit");

      const dialog_alert_message = $("div.dialog.alert");

      //TODO: Make this list configurable from the plugin interface
    if (
      $("#hold-found1").length ||
      $("#hold-found2").length)
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
      $("p.ret_checkinmsg").length ||
    { 
halt = true;
    }

      if ( action == "renew"  && $('button.approve').length ) {
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
    console.log("NEEDS CONFIMRATION");
    const button = $("#circ-needsconfirmation-modal button.deny");
    button.on("click", function () {
      continue_processing = true;
      initiate_rfid_scanning();
    });
  } else if ( halt && !continue_processing ) {

	      console.log("HALTING FOR PROBLEM MESSAGE");
	  if ( show_continue_processing_button ) {
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
		  submit_form_automatically,
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
        submit_form_automatically,
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
          processed_barcodes,
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
            submit_form_automatically,
          );
        } else {
          console.log("NO BARCODE TO PROCESS");
          // Start again, librarian may put new stack of items on the RFID pad
          handle_one_at_a_time();
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
  submit_form_automatically,
) {
  barcode_input.val(barcode);
  if (security_setting == "enable" || security_setting == "disable") {
    const security_flag_value = security_setting == "enable" ? true : false;

    const r = alter_security_bits([barcode], security_flag_value).then(
      function () {
        form_submit.click();
      },
    );
  } else {
    // No change in RFID security bits
    if (submit_form_automatically) {
      form_submit.click();
    }
  }
}

function initiate_rfid_scanning() {
  $.getJSON(`${circit_address}/getitems`, function (data) {
    if (data.status === true) {
      detect_and_handle_rfid_for_page(data);
    } else {
      display_rfid_failure();
    }
  }).fail(function () {
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
        handle_batch(
          current_action,
          "ignore",
          $("#barcodelist"),
          "",
          function () {
            return false;
          },
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
          },
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
          },
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
  localStorage.setItem("koha_plugin_rfid_circit_previous_action", action);
}

function get_previous_action() {
  return localStorage.getItem("koha_plugin_rfid_circit_previous_action");
}

function set_unprocessed_barcodes(barcodes) {
  return localStorage.setItem(
    "koha_plugin_rfid_circit_unprocessed_barcodes",
    JSON.stringify(barcodes),
  );
}

function get_unprocessed_barcodes() {
  console.log("get_unprocessed_barcodes");
  const barcodes_json = localStorage.getItem(
    "koha_plugin_rfid_circit_unprocessed_barcodes",
  );
  console.log("UNPROCESSED BARCODES JSON: ", barcodes_json);
  let barcodes = barcodes_json ? JSON.parse(barcodes_json) : [];
  return barcodes;
}

function get_processed_barcodes() {
  console.log("get_processed_barcodes");
  const barcodes_json = localStorage.getItem(
    "koha_plugin_rfid_circit_processed_barcodes",
  );
  console.log("PROCESSED BARCODES JSON: ", barcodes_json);
  let barcodes = barcodes_json ? JSON.parse(barcodes_json) : [];
  return barcodes;
}

function set_processed_barcodes(barcodes) {
  return localStorage.setItem(
    "koha_plugin_rfid_circit_processed_barcodes",
    JSON.stringify(barcodes),
  );
}

function add_processed_barcode(barcode) {
  let barcodes = get_processed_barcodes();
  barcodes.push(barcode);
  set_processed_barcodes(barcodes);
}

function display_rfid_failure() {
  console.log("RFID FAILURE");
}

// This function is for pages where bacodes cannot be run in batch *or* scanned repeatedly.
// A good example of this is the barcode image generator
function handle_one_and_done(
  action,
  security_setting,
  barcode_input,
  form_submit,
  auto_submit_test_cb,
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
          "More than one RFID tag is on the reader. Please remove all but one RFID tag and click 'OK'",
        );
        handle_one_and_done(
          action,
          security_setting,
          barcode_input,
          form_submit,
          auto_submit_test_cb,
        );
      } else {
        barcode_input.val(barcodes[0]);

        const submit_form_automatically = auto_submit_test_cb
          ? auto_submit_test_cb(
              action,
              security_setting,
              barcode_input,
              form_submit,
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
            },
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
  processed_barcodes,
) {
  console.log("combine_barcodes");
  // Add the barcodes on the rfid pad to the currently uprocessed barcode
  let combined_barcodes = unprocessed_barcodes.concat(
    rfid_pad_barcodes.filter((item) => unprocessed_barcodes.indexOf(item) < 0),
  );
  console.log(
    "COMBINED UNPROCESSED AND RFID PAD BARCODES: ",
    combined_barcodes,
  );
  // Then remove out any barcodes we have already seen
  combined_barcodes = combined_barcodes.filter(
    (el) => !processed_barcodes.includes(el),
  );
  console.log("COMBINED BARCODES WITH PROCESSED BARCODES REMOVED");

  return combined_barcodes;
}

function handle_batch(
  action,
  security_setting,
  barcodes_textarea,
  form_submit,
  auto_submit_test_cb,
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
      console.log("BARCODES: ", barcodes);
      if (!form_submit) {
        form_submit = barcodes_textarea.closest("form").find(":submit");
      }
      barcodes_textarea.val(barcodes.join("\r\n"));

      const submit_form_automatically = auto_submit_test_cb
        ? auto_submit_test_cb(
            action,
            security_setting,
            barcodes_textarea,
            form_submit,
          )
        : true;

      if (security_setting == "enable" || security_setting == "disable") {
        const security_flag_value = security_setting == "enable" ? true : false;
        const r = alter_security_bits(barcodes, security_flag_value).then(
          function () {
            if (submit_form_automatically) {
              form_submit.click();
            }
          },
        );
      } else {
        // No change in RFID security bits
        if (submit_form_automatically) {
          form_submit.click();
        }
      }
    });
  }
}

let alter_security_bits = async (barcodes, bit_value) => {
  console.log("alter_security_bits", barcodes, bit_value);
  barcodes.forEach((each) =>
    $.ajax({
      url: `${circit_address}/setsecurity/${each}/${bit_value}`,
      dataType: "json",
      async: false,
      success: function (data) {
        console.log("setsecurity RETURNED", data);
        return data;
      },
      failure: function () {
        result = false;
      },
    }),
  );
};

function poll_rfid_for_barcodes_batch(cb, no_wait) {
  console.log("poll_rfid_for_barcodes_batch", cb);
  let items_count = 0;

  intervalID = setInterval(function () {
    $.getJSON(`${circit_address}/getitems`, function (data) {
      console.log(data);
      if (data.items && data.items.length) {
        // We have at least one item on the pad
        if (items_count > 0 && items_count == data.items.length) {
          // No more items have been added since the last check
          // so it is time to process the stack of items.
          clearInterval(intervalID);
          console.log(
            "ITEMS HAVE SETTLED, FINISHED WAITING, INITIATING CALLBACK",
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
  }, 1500);
  console.log("INTERVAL ID:", intervalID);
  return intervalID;
}
