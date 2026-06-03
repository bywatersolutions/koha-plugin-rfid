#!/usr/bin/env perl

# Seed deterministic data for the RFID Cypress suite.
#
# Run INSIDE the ktd koha container ( it needs Koha's Perl environment ):
#   ktd --name rfidtest --shell --run "perl /kohadevbox/plugins/koha-plugin-rfid/t/cypress/seed.pl"
#
# It is idempotent: re-running reuses the existing patron / items and just
# makes sure they're loanable and not currently checked out, so the suite can
# run over and over. The only thing printed to STDOUT is a single JSON line
# that the runner captures into t/cypress/fixtures/seed.json; everything else
# goes to STDERR.

use Modern::Perl;

use Mojo::JSON qw(encode_json);
use MARC::Record;

use C4::Context;
use C4::Biblio      qw(AddBiblio);
use C4::Circulation qw(AddReturn);

use Koha::Patrons;
use Koha::Patron::Categories;
use Koha::Libraries;
use Koha::Items;
use Koha::ItemTypes;

my $cardnumber = "RFIDTESTPATRON";
my @barcodes   = qw( RFIDTEST001 RFIDTEST002 RFIDTEST003 );

# Pick a real library and item type from the sample data
my $branchcode = Koha::Libraries->search( {}, { rows => 1 } )->next->branchcode;
my $itemtype   = Koha::ItemTypes->search( {}, { rows => 1 } )->next->itemtype;

# Use a real patron category and make batch checkout valid for it
my $categorycode =
    Koha::Patron::Categories->search( {}, { rows => 1 } )->next->categorycode;

C4::Context->set_preference( "BatchCheckouts",               1 );
C4::Context->set_preference( "BatchCheckoutsValidCategories", $categorycode );
warn "Enabled BatchCheckouts for category '$categorycode' at library '$branchcode'\n";

# The real CircIT reader uses privileged port 80; point the plugin at the
# unprivileged port the circit emulator runs on during testing. The runner
# passes that port ( CIRCIT_TEST_PORT ) as the first argument so there's a
# single source of truth; fall back to 8090 if run on its own.
my $circit_test_port = ( $ARGV[0] && $ARGV[0] =~ /\A[0-9]+\z/ ) ? $ARGV[0] : 8090;
C4::Context->set_preference( "RFIDCircitPort", $circit_test_port );
warn "Set RFIDCircitPort to $circit_test_port\n";

# Find or create the test patron
my $patron = Koha::Patrons->find( { cardnumber => $cardnumber } );
unless ($patron) {
    $patron = Koha::Patron->new(
        {
            cardnumber   => $cardnumber,
            surname      => "RFID",
            firstname    => "Test",
            categorycode => $categorycode,
            branchcode   => $branchcode,
            userid       => "rfidtestpatron",
        }
    )->store;
    warn "Created patron $cardnumber\n";
}

# Find or create the test items, reusing a single biblio
my $biblionumber;
my @existing = grep { $_ } map { Koha::Items->find( { barcode => $_ } ) } @barcodes;
$biblionumber = $existing[0]->biblionumber if @existing;

unless ($biblionumber) {
    my $record = MARC::Record->new();
    $record->append_fields(
        MARC::Field->new( "245", "", "", "a" => "RFID Cypress Test Record" ) );
    ($biblionumber) = AddBiblio( $record, "" );
    warn "Created biblio $biblionumber\n";
}

for my $barcode (@barcodes) {
    my $item = Koha::Items->find( { barcode => $barcode } );
    if ($item) {
        # Make sure it's loanable and located at our test library
        $item->set(
            {
                homebranch    => $branchcode,
                holdingbranch => $branchcode,
                notforloan    => 0,
                itemlost      => 0,
                withdrawn     => 0,
                damaged       => 0,
            }
        )->store;
    } else {
        $item = Koha::Item->new(
            {
                biblionumber  => $biblionumber,
                barcode       => $barcode,
                homebranch    => $branchcode,
                holdingbranch => $branchcode,
                itype         => $itemtype,
                notforloan    => 0,
            }
        )->store;
        warn "Created item $barcode\n";
    }

    # If it's checked out ( from a previous run ), return it so the suite repeats
    if ( $item->checkout ) {
        AddReturn( $barcode, $branchcode );
        warn "Returned previously checked-out item $barcode\n";
    }
}

print encode_json(
    {
        borrowernumber => $patron->borrowernumber + 0,
        cardnumber     => $cardnumber,
        barcodes       => \@barcodes,
    }
) . "\n";
