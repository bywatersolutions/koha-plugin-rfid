package Koha::Plugin::Com::ByWaterSolutions::RFID;

use Modern::Perl;

use Mojo::JSON qw(decode_json encode_json);

use C4::Context;
use Koha::Libraries;

use base qw(Koha::Plugins::Base);

our $VERSION         = "0.7.2";
our $MINIMUM_VERSION = "{MINIMUM_VERSION}";

# Optional halt conditions a library can choose to halt on or ignore. The keys
# must stay in sync with the optional entries of RFID_CONDITIONS in
# static_files/rfid.js; 'default' must match that catalog's default. 'action'
# is only used to group the configuration UI.
our @OPTIONAL_CONDITIONS = (
    { key => 'circ_impossible',      action => 'checkout', default => 1, label => 'Checkout blocked ( item cannot be issued )' },
    { key => 'restricted_backdated', action => 'checkin',  default => 1, label => 'Backdated checkin made patron restricted' },
    { key => 'transfer_trigger',     action => 'checkin',  default => 1, label => 'Transfer reason notice' },
    { key => 'ret_badbarcode',       action => 'checkin',  default => 1, label => 'Barcode not found' },
    { key => 'ret_blocked',          action => 'checkin',  default => 1, label => 'Return blocked ( lost item )' },
    { key => 'ret_charged',          action => 'checkin',  default => 1, label => 'Lost item: new overdue charged' },
    { key => 'ret_datacorrupt',      action => 'checkin',  default => 1, label => 'Data corruption error' },
    { key => 'ret_refund',           action => 'checkin',  default => 1, label => 'Lost item fee refunded' },
    { key => 'ret_restored',         action => 'checkin',  default => 1, label => 'Lost item fee restored' },
    { key => 'ret_withdrawn',        action => 'checkin',  default => 1, label => 'Item withdrawn' },
    { key => 'ret_checkinmsg',       action => 'checkin',  default => 1, label => 'Item type checkin message' },
    { key => 'ret_notissued',        action => 'checkin',  default => 0, label => 'Item was not checked out' },
    { key => 'ret_localuse',         action => 'checkin',  default => 0, label => 'Local use recorded' },
    { key => 'ret_transferred',      action => 'checkin',  default => 0, label => 'Arrived from transfer' },
    { key => 'ret_checkedin',        action => 'checkin',  default => 0, label => 'Lost item found and checked in' },
    { key => 'ret_debarred',         action => 'checkin',  default => 0, label => 'Patron now restricted' },
    { key => 'ret_prevdebarred',     action => 'checkin',  default => 0, label => 'Patron previously restricted' },
    { key => 'ret_foreverdebarred',  action => 'checkin',  default => 0, label => 'Patron indefinitely restricted' },
    { key => 'ret_nflupdate',        action => 'checkin',  default => 0, label => 'Not-for-loan status updated' },
    { key => 'ret_location_update',  action => 'checkin',  default => 0, label => 'Shelving location updated' },
    { key => 'rotating_collection',  action => 'checkin',  default => 0, label => 'Rotating collection transfer' },
    { key => 'bundle_missing_items', action => 'checkin',  default => 0, label => 'Bundle missing items' },
);

## Here is our metadata, some keys are required, some are optional
our $metadata = {
    name            => 'RFID',
    author          => 'Kyle M Hall',
    date_authored   => '2024-05-13',
    date_updated    => "1900-01-01",
    minimum_version => $MINIMUM_VERSION,
    maximum_version => undef,
    version         => $VERSION,
    description     => 'Add support for RFID reading via Tech Logic CircIT',
    namespace       => 'rfid',
};

## This is the minimum code required for a plugin's 'new' method
## More can be added, but none should be removed
sub new {
    my ($class, $args) = @_;

    ## We need to add our metadata here so our base class can access it
    $args->{'metadata'} = $metadata;
    $args->{'metadata'}->{'class'} = $class;

    ## Here, we call the 'new' method for our base class
    ## This runs some additional magic and checking
    ## and returns our actual $self
    my $self = $class->SUPER::new($args);

    return $self;
}

# Resolve whether an optional halt condition is enabled for a branch: a
# per-branch override wins over the global setting, which wins over the catalog
# default. Returns 1 ( halt ) or 0 ( ignore ).
sub resolve_halt {
    my ( $self, $key, $branch, $default ) = @_;

    if ($branch) {
        my $override = $self->retrieve_data("rfid_halt_${key}_branch_${branch}");
        return $override ? 1 : 0 if defined $override && $override ne q{};
    }

    my $global = $self->retrieve_data("rfid_halt_$key");
    return $global ? 1 : 0 if defined $global && $global ne q{};

    return $default ? 1 : 0;
}

sub configure {
    my ($self, $args) = @_;
    my $cgi = $self->{'cgi'};

    my @libraries = Koha::Libraries->search( {}, { order_by => ['branchname'] } )->as_list;

    unless ($cgi->param('save')) {
        my $template = $self->get_template({file => 'configure.tt'});

        my @branches;
        for my $lib (@libraries) {
            # Per-branch override of each optional condition: 'halt', 'ignore'
            # or 'inherit' ( fall back to the global setting )
            my @overrides;
            for my $cond (@OPTIONAL_CONDITIONS) {
                my $stored = $self->retrieve_data(
                    'rfid_halt_' . $cond->{key} . '_branch_' . $lib->branchcode );
                my $value =
                    !defined $stored || $stored eq q{} ? 'inherit'
                    : $stored                          ? 'halt'
                    :                                    'ignore';
                push @overrides, { key => $cond->{key}, label => $cond->{label}, value => $value };
            }

            push @branches, {
                branchcode    => $lib->branchcode,
                branchname    => $lib->branchname,
                rfid_disabled => $self->retrieve_data( 'rfid_disabled_branchcode_' . $lib->branchcode ) ? 1 : 0,
                overrides     => \@overrides,
            };
        }

        # The global halt setting for each optional condition ( falls back to
        # the catalog default when the library hasn't set one )
        my @conditions;
        for my $cond (@OPTIONAL_CONDITIONS) {
            my $stored = $self->retrieve_data( 'rfid_halt_' . $cond->{key} );
            my $global = !defined $stored || $stored eq q{} ? $cond->{default} : ( $stored ? 1 : 0 );
            push @conditions, {
                key       => $cond->{key},
                label     => $cond->{label},
                action    => $cond->{action},
                halt      => $global,
            };
        }

        ## Grab the values we already have for our settings, if any exist
        $template->param(
            branches   => \@branches,
            conditions => \@conditions,
        );

        $self->output_html($template->output());
    }
    else {
        my @enabled_branchcodes = $cgi->multi_param('rfid_enabled_branchcodes');
        for my $lib (@libraries) {
            my $bc = $lib->branchcode;
            my $disabled = ( grep { $_ eq $bc } @enabled_branchcodes ) ? 0 : 1;
            $self->store_data({ "rfid_disabled_branchcode_$bc" => $disabled });
        }

        # Global halt setting per optional condition ( checkbox present = halt )
        my %global_halt = map { $_ => 1 } $cgi->multi_param('halt_global');
        for my $cond (@OPTIONAL_CONDITIONS) {
            $self->store_data({ 'rfid_halt_' . $cond->{key} => $global_halt{ $cond->{key} } ? 1 : 0 });
        }

        # Per-branch overrides: 'halt' => 1, 'ignore' => 0, 'inherit' => clear.
        # Only write when the value actually changes to avoid needless churn.
        for my $lib (@libraries) {
            my $bc = $lib->branchcode;
            for my $cond (@OPTIONAL_CONDITIONS) {
                my $field   = 'halt_override_' . $cond->{key} . '_' . $bc;
                my $choice  = $cgi->param($field) // 'inherit';
                my $want    = $choice eq 'halt' ? 1 : $choice eq 'ignore' ? 0 : q{};
                my $key     = 'rfid_halt_' . $cond->{key} . '_branch_' . $bc;
                my $current = $self->retrieve_data($key);
                $current = q{} unless defined $current;
                $self->store_data({ $key => $want }) unless "$current" eq "$want";
            }
        }

        $self->go_home();
    }
}

sub api_namespace {
    my ($self) = @_;

    return 'rfid';
}

sub static_routes {
    my ($self, $args) = @_;

    my $spec_str = $self->mbf_read('staticapi.json');
    my $spec     = decode_json($spec_str);

    return $spec;
}

sub intranet_js {
    my ($self) = @_;

    my $branch = eval { C4::Context->userenv->{branch} } // q{};
    if ($branch) {
        my $rfid_disabled = $self->retrieve_data("rfid_disabled_branchcode_$branch");
        return q{} if $rfid_disabled;
    }

    # The CircIT reader port can be overridden for non-standard installs or for
    # testing, via the KOHA_RFID_CIRCIT_PORT environment variable or the
    # RFIDCircitPort system preference ( the env var wins if both are set ).
    my $circit_port = $ENV{KOHA_RFID_CIRCIT_PORT};
    $circit_port = C4::Context->preference('RFIDCircitPort')
        unless defined $circit_port && $circit_port ne q{};

    # Resolve, for this branch, which optional conditions should halt, so
    # rfid.js can honor the library's halt-vs-ignore choices.
    my %halt_conditions;
    for my $cond (@OPTIONAL_CONDITIONS) {
        $halt_conditions{ $cond->{key} } =
            $self->resolve_halt( $cond->{key}, $branch, $cond->{default} ) ? \1 : \0;
    }
    my $halt_json = encode_json( \%halt_conditions );

    my $config_lines = qq{       window.koha_plugin_rfid.halt_conditions = $halt_json;\n};
    # Only accept a plain numeric port, so nothing unsafe ends up in the page
    if ( defined $circit_port && $circit_port =~ /\A[0-9]{1,5}\z/ ) {
        $config_lines .= qq{       window.koha_plugin_rfid.circit_port = "$circit_port";\n};
    }

    my $config_js = qq{
     <script type="text/javascript">
       window.koha_plugin_rfid = window.koha_plugin_rfid || {};
$config_lines     </script>};

    return $config_js . q{
     <script type="text/javascript" src="/api/v1/contrib/rfid/static/static_files/rfid.js"></script>
    };
}

1;
