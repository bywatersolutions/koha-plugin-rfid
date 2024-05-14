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

$(document).ready(function() {
    $.getJSON(rfid_get_items_url, function(data) {
        detect_and_handle_rfid_for_page(data);
    }).fail(function() {
        display_rfid_failure();
    })
});

function detect_and_handle_rfid_for_page(data) {
    if (data.status === true) {
        const href = window.location.href;
        if (href.indexOf("circulation.pl") > -1) {
            if ($("h1:contains(Batch check out)")) {
                handle_batch_checkout();
            } else {
                handle_checkout();
            }
        }
    } else {
        display_rfid_failure();
    }
}

function display_rfid_failure() {
    console.log("RFID FAILURE");
}

function handle_batch_checkout() {
    console.log("handle_batch_checkout");

    const barcodelist = $("#barcodelist");
    if (barcodelist.length) {
        poll_rfid_for_barcodes_batch(function(data) {
            let barcodes = data.items.map(function(item) {
                return item.barcode;
            });
            console.log("BARCODES: ", barcodes);
            const r = alter_security_bits(barcodes, false).then(function() {
                barcodelist.val(barcodes.join("\r\n"));
                const submit = barcodelist.closest('form').find(':submit');
                submit.click();
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

function handle_checkout() {
    console.log("handle_checkout");
    console.log("NOT YET IMPLEMENTED");
}

function poll_rfid_for_barcodes_batch(cb) {
    console.log("poll_rfid_for_barcodes_batch", cb);
    let items_count = 0;

    const intervalID = setInterval(function() {
        $.getJSON(rfid_get_items_url, function(data) {
            console.log(data);
            if (data.items && data.items.length) { // We have at least one item on the pad
                if (items_count > 0 && items_count == data.items.length) {
                    // No more items have been added since the last check
                    // so it's time to process the stack of items.
                    clearInterval(intervalID);
                    console.log("DO IT");
                    cb(data);
                } else {
                    items_count = data.items.length;
                }
            }
        });
    }, 2000);
    console.log("INTERVAL ID:", intervalID);
    return intervalID;
}

function rfid_get_items(cb) {
    console.log("rfid_get_items", cb);

    return true;
}
    |;
}

1;
