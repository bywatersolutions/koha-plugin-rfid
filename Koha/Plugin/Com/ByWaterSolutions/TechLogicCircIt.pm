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
        <script>console.log("Thanks for testing the kitchen sink plugin!");</script>
    |;
}

1;
