package Koha::Plugin::Com::ByWaterSolutions::RFID;

use Modern::Perl;

use Mojo::JSON qw(decode_json);

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

    unless ($cgi->param('save')) {
        my $template = $self->get_template({file => 'configure.tt'});

        ## Grab the values we already have for our settings, if any exist
        $template->param(
            TechLogicCircItPort                  => $self->retrieve_data('TechLogicCircItPort'),
            TechLogicCircItNonAdministrativeMode => $self->retrieve_data('TechLogicCircItNonAdministrativeMode'),
        );

        $self->output_html($template->output());
    }
    else {
        $self->store_data({
            TechLogicCircItPort                  => $cgi->param('TechLogicCircItPort'),
            TechLogicCircItNonAdministrativeMode => $cgi->param('TechLogicCircItNonAdministrativeMode'),
        });
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
