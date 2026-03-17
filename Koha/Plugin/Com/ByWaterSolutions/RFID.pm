package Koha::Plugin::Com::ByWaterSolutions::RFID;

use Modern::Perl;

use Mojo::JSON qw(decode_json);

use C4::Context;
use Koha::Libraries;

use base qw(Koha::Plugins::Base);

our $VERSION         = "{VERSION}";
our $MINIMUM_VERSION = "{MINIMUM_VERSION}";

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

sub configure {
    my ($self, $args) = @_;
    my $cgi = $self->{'cgi'};

    my @libraries = Koha::Libraries->search( {}, { order_by => ['branchname'] } )->as_list;

    unless ($cgi->param('save')) {
        my $template = $self->get_template({file => 'configure.tt'});

        my @branches;
        for my $lib (@libraries) {
            push @branches, {
                branchcode    => $lib->branchcode,
                branchname    => $lib->branchname,
                rfid_disabled => $self->retrieve_data( 'rfid_disabled_branchcode_' . $lib->branchcode ) ? 1 : 0,
            };
        }

        ## Grab the values we already have for our settings, if any exist
        $template->param(
            TechLogicCircItPort                  => $self->retrieve_data('TechLogicCircItPort'),
            TechLogicCircItNonAdministrativeMode => $self->retrieve_data('TechLogicCircItNonAdministrativeMode'),
            branches                             => \@branches,
        );

        $self->output_html($template->output());
    }
    else {
        $self->store_data({
            TechLogicCircItPort                  => $cgi->param('TechLogicCircItPort'),
            TechLogicCircItNonAdministrativeMode => $cgi->param('TechLogicCircItNonAdministrativeMode'),
        });

        my @enabled_branchcodes = $cgi->multi_param('rfid_enabled_branchcodes');
        for my $lib (@libraries) {
            my $bc = $lib->branchcode;
            my $disabled = ( grep { $_ eq $bc } @enabled_branchcodes ) ? 0 : 1;
            $self->store_data({ "rfid_disabled_branchcode_$bc" => $disabled });
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

    my $TechLogicCircItPort = $self->retrieve_data('TechLogicCircItPort') || '9201';
    my $TechLogicCircItNonAdministrativeMode = $self->retrieve_data('TechLogicCircItNonAdministrativeMode') || q{};
    return qq{
     <script>
        const TechLogicCircItPort = "$TechLogicCircItPort";
        const TechLogicCircItNonAdministrativeMode = "$TechLogicCircItNonAdministrativeMode";
     </script>
     <script type="text/javascript" src="/api/v1/contrib/rfid/static/static_files/rfid.js"></script>
    };
}

1;
