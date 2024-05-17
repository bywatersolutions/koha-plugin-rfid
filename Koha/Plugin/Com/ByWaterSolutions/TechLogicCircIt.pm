package Koha::Plugin::Com::ByWaterSolutions::TechLogicCircIt;

use Modern::Perl;

use base qw(Koha::Plugins::Base);

our $VERSION = "{VERSION}";
our $MINIMUM_VERSION = "{MINIMUM_VERSION}";

## Here is our metadata, some keys are required, some are optional
our $metadata = {
    name            => 'Tech Logic CircIT',
    author          => 'Kyle M Hall',
    date_authored   => '2024-05-13',
    date_updated    => "1900-01-01",
    minimum_version => $MINIMUM_VERSION,
    maximum_version => undef,
    version         => $VERSION,
    description     => 'Add support for Tech Logic CircIT to Koha',
    namespace       => 'techlogiccircit',
};

## This is the minimum code required for a plugin's 'new' method
## More can be added, but none should be removed
sub new {
    my ( $class, $args ) = @_;

    ## We need to add our metadata here so our base class can access it
    $args->{'metadata'} = $metadata;
    $args->{'metadata'}->{'class'} = $class;

    ## Here, we call the 'new' method for our base class
    ## This runs some additional magic and checking
    ## and returns our actual $self
    my $self = $class->SUPER::new($args);

    return $self;
}

sub configure {
    my ($self, $args) = @_;
    my $cgi = $self->{'cgi'};

    unless ($cgi->param('save')) {
        my $template = $self->get_template({file => 'configure.tt'});

        ## Grab the values we already have for our settings, if any exist
        $template->param(
            SomeSetting => $self->retrieve_data('SomeSetting'),
        );

        $self->output_html($template->output());
    }
    else {
        $self->store_data({
            SomeSetting => $cgi->param('SomeSetting'),
        });
        $self->go_home();
    }
}

sub intranet_js {
    my ( $self ) = @_;

    return q|
const circit_address = "http://localhost:9201";
const rfid_get_items_url = `${circit_address}/getitems`;

// Sometimes we need to halt processing on non-batch pages and continue after the issue has been resolved
let continue_processing = false;
let intervalID = "";

$(document).ready(function() {
    $.getJSON(rfid_get_items_url, function(data) {
        if (data.status === true) {
            detect_and_handle_rfid_for_page(data);
        } else {
            display_rfid_failure();
        }
    }).fail(function() {
        display_rfid_failure();
    })
});

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
            case 'batch_checkout':
                handle_batch();
                break;
            case 'checkout':
                handle_one_at_a_time(current_action);
                break;
            case 'checkin':
                handle_one_at_a_time(current_action);
                break;
            case 'renew':
                handle_one_at_a_time(current_action);
                break;
            case 'list_add_items':
                const barcodes_textarea = $("#barcodes");
                handle_batch(current_action, barcodes_textarea);
            break;
            default:
                console.log(`ERROR: Action ${action} has no handler!`);
        }
    }
}

// We've gone from one action to another
// e.g. from checkout to checkin, or batch checkout to batch item modifer
// Clear out the queued up barcodes and start fresh
function handle_action_change() {
    console.log("handle_action_change");
    set_previous_action("");
    set_unprocessed_barcodes([]);
    set_processed_barcodes([]);
};

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
    }
}

function set_previous_action(action) {
    localStorage.setItem("koha_plugin_rfid_circit_previous_action", action);
}

function get_previous_action() {
    return localStorage.getItem("koha_plugin_rfid_circit_previous_action");
}

function set_unprocessed_barcodes(barcodes) {
    return localStorage.setItem("koha_plugin_rfid_circit_unprocessed_barcodes", JSON.stringify(barcodes));

}

function get_unprocessed_barcodes() {
    console.log("get_unprocessed_barcodes");
    const barcodes_json = localStorage.getItem("koha_plugin_rfid_circit_unprocessed_barcodes");
    console.log("UNPROCESSED BARCODES JSON: ", barcodes_json);
    let barcodes = barcodes_json ? JSON.parse(barcodes_json) : [];
    return barcodes;
}

function get_processed_barcodes() {
    console.log("get_processed_barcodes");
    const barcodes_json = localStorage.getItem("koha_plugin_rfid_circit_processed_barcodes");
    console.log("UNPROCESSED BARCODES JSON: ", barcodes_json);
    let barcodes = barcodes_json ? JSON.parse(barcodes_json) : [];
    return barcodes;
}

function set_processed_barcodes(barcodes) {
    return localStorage.setItem("koha_plugin_rfid_circit_processed_barcodes", JSON.stringify(barcodes));
}

function add_processed_barcode(barcode) {
    let barcodes = get_processed_barcodes();
    barcodes.push(barcode);
    set_processed_barcodes(barcodes);
}

function display_rfid_failure() {
    console.log("RFID FAILURE");
}

function handle_one_at_a_time(action) {
    console.log("handle_one_at_a_time");

    const barcode_input = (action == "renew") ? $('[name="barcode"]') : $("#barcode");
    const message = $("div.dialog.alert");

    if (message.length && !continue_processing) {
        if (action != 'renew') { // renew has it's own "continue" button
            console.log("THERE IS A MESSAGE");
            const btn = `<button class="rfid-continue">Continue processing RFID tags</button>`;
            message.append(btn);
            message.on("click", "button.rfid-continue", function() {
                console.log("CLICKED rfid-continue BUTTON");
                $("button.rfid-continue").hide();
                continue_processing = true;
                handle_one_at_a_time();
            });
        }
    } else if (barcode_input.length) {
        // For one at a time pages, we can keep processing the current unproccessed items
        // once that list is empty we go looking for more items on the RFID pad
        let unprocessed_barcodes = get_unprocessed_barcodes();

        if (unprocessed_barcodes.length) {
            console.log("XXXXXXADSFDSAFSDAFDSASDFAFADSDFSADSFADSFADSFFADSFADSDSFSDFASAFD");
            const barcode = unprocessed_barcodes.pop()

            set_unprocessed_barcodes(unprocessed_barcodes);
            add_processed_barcode(barcode);

            // Duplicate code below, ID:1
            const r = alter_security_bits([barcode], true).then(function() {
                barcode_input.val(barcode);
                const submit = barcode_input.closest('form').find(':submit');
                submit.click();
            });


        } else { // We have no unprocessed barcodes, let's look for some on the RFID pad

            poll_rfid_for_barcodes_batch(function(data) {
                let unprocessed_barcodes = get_unprocessed_barcodes();
                console.log("UNPROCESSED BARCODES: ", unprocessed_barcodes);



                let rfid_pad_barcodes = data.items.map(function(item) {
                    return item.barcode;
                });
                console.log("NEW BARCODES: ", rfid_pad_barcodes);

                let processed_barcodes = get_processed_barcodes();

                let combined_barcodes = combine_barcodes(rfid_pad_barcodes, unprocessed_barcodes, processed_barcodes);
                console.log("COMBINED BARCODES: ", combined_barcodes);

                const barcode = combined_barcodes.pop()
                if (barcode) {
                    set_unprocessed_barcodes(combined_barcodes);
                    add_processed_barcode(barcode);

                    // Duplicate code above, ID:1
                    const r = alter_security_bits([barcode], true).then(function() {
                        barcode_input.val(barcode);
                        const submit = barcode_input.closest('form').find(':submit');
                        submit.click();
                    });
                } else {
                    console.log("NO BARCODE TO PROCESS");
                    // Start again, librarian may put new stack of items on the RFID pad
                    handle_one_at_a_time();
                }


            }, true); // The 'true' enables the 'no wait' option for 'one at a time' processing
        }
    }
}

function combine_barcodes(rfid_pad_barcodes, unprocessed_barcodes, processed_barcodes) {
    console.log("combine_barcodes");
    // Add the barcodes on the rfid pad to the currently uprocessed barcode
    let combined_barcodes = unprocessed_barcodes.concat(rfid_pad_barcodes.filter((item) => unprocessed_barcodes.indexOf(item) < 0));
    console.log("COMBINED UNPROCESSED AND RFID PAD BARCODES: ", combined_barcodes);
    // Then remove out any barcodes we've already seen
    combined_barcodes = combined_barcodes.filter((el) => !processed_barcodes.includes(el));
    console.log("COMBINED BARCODES WITH PROCESSED BARCODES REMOVED");

    return combined_barcodes;
}


function handle_batch(action, barcodes_textarea, form_submit) {
    console.log("handle_batch");

    if ( !barcodes_textarea ) {
      barcodes_textarea = $("#barcodelist");
    }

    if (barcodes_textarea.length) {
        poll_rfid_for_barcodes_batch(function(data) {
            let barcodes = data.items.map(function(item) {
                return item.barcode;
            });
            console.log("BARCODES: ", barcodes);
            const r = alter_security_bits(barcodes, false).then(function() {
                barcodes_textarea.val(barcodes.join("\r\n"));
                if ( !form_submit ) {
                  form_submit = barcodes_textarea.closest('form').find(':submit');
                }
                form_submit.click();
            });
        });
    }
}

let alter_security_bits = async (barcodes, bit_value) => {
    console.log('alter_security_bits', barcodes, bit_value);
    const result = await Promise.all(
        barcodes.map(each => $.getJSON(`${circit_address}/setsecurity/${each}/${bit_value}`))
    );
    return result;
}

function poll_rfid_for_barcodes_batch(cb, no_wait) {
    console.log("poll_rfid_for_barcodes_batch", cb);
    let items_count = 0;

    intervalID = setInterval(function() {
        $.getJSON(rfid_get_items_url, function(data) {
            console.log(data);
            if (data.items && data.items.length) { // We have at least one item on the pad
                if (items_count > 0 && items_count == data.items.length) {
                    // No more items have been added since the last check
                    // so it's time to process the stack of items.
                    clearInterval(intervalID);
                    console.log("ITEMS HAVE SETTLED, FINISHED WAITING, INITIATING CALLBACK");
                    cb(data);
                } else {
                    items_count = data.items.length;
                }
            } else if (no_wait) {
                clearInterval(intervalID);
                console.log("NOT WAIT ENABLED, INTIATED CALLBACK");
                cb(data);
            }
        });
    }, 1000);
    console.log("INTERVAL ID:", intervalID);
    return intervalID;
}
    |;
}

1;
