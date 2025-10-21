#!/usr/bin/env perl

use Mojolicious::Lite -signatures;
use Mojo::JSON qw(encode_json decode_json);
use Mojo::Util qw(url_escape);
use Mojo::File 'path';
use Data::Dumper;

$Data::Dumper::Deepcopy = 1;


# Configuration
my $config = {
    barcodes => {},
};

# Helper to set barcodes
helper set_barcodes => sub ($c, $barcodes) {
    my @b = split /\s+/, $barcodes;
    my %found = map { $_ => 1 } @b;  # build lookup for quick existence checks

    # Remove barcodes not in the new list
    foreach my $existing (keys %{ $config->{barcodes} }) {
        delete $config->{barcodes}{$existing} unless $found{$existing};
    }

    # Add new barcodes
    foreach my $b (@b) {
        $config->{barcodes}{$b} //= { security => \1 };
    }

    say "Barcodes set to " . Data::Dumper::Dumper($config->{barcodes});

    return scalar keys %{ $config->{barcodes} };
};

get '/' => 'index';

get '/alive' => sub ($c) {
        return $c->render(
            json => {
                statuscode => 0,
                status => Mojo::JSON->true,
            }
        );
};

get '/getitems' => sub ($c) {
        return $c->render(
            json => {
                statuscode => 0,
                status => \1,
                items => $config->{barcodes},
            }
        );
};

get '/setsecurity/:barcode/:security_bit' => sub ($c) {
    my $barcode = $c->param('barcode');
    my $security_bit = $c->param('security_bit');

    if ( $config->{barcodes}{$barcode} ) {
        $config->{barcodes}{$barcode}{security} = $security_bit eq 'true' ? \1 : \0;

        return $c->render(
            json => {
                status => Mojo::JSON->true,
                statuscode => 0,
            }
        );
    } else {
        return $c->render(
            json => {
                status => 'error',
                message => 'Barcode not found'
            },
            status => 404
        );
    }
};

post '/api/barcodes' => sub ($c) {
    my $barcodes = $c->req->json->{barcodes} // '';
    my $count = $c->set_barcodes($barcodes);
    
    $c->render(
        json => {
            status => 'ok',
            count => $count
        }
    );
};

# Start the application
app->start;

__DATA__

@@ index.html.ep
% layout 'default';
% title 'Tech Logic CircIt RFID Emulator';

<div class="container mt-5">
    <div class="row">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h5>RFID Emulator</h5>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label for="barcodes" class="form-label">Barcodes (one per line or space-separated):</label>
                        <textarea class="form-control" id="barcodes" rows="10"></textarea>
                    </div>
                    <button id="updateBarcodes" class="btn btn-primary">Update Barcodes</button>
                </div>
            </div>
        </div>
    </div>
</div>

@@ layouts/default.html.ep
<!DOCTYPE html>
<html>
<head>
    <title><%= title %></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <style>
        body { padding: 20px; }
        .card { margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <%= content %>
    </div>

    <script>
        $(document).ready(function() {
            // Update barcodes
            $('#updateBarcodes').click(function() {
                const barcodes = $('#barcodes').val();
                
                $.ajax({
                    url: '/api/barcodes',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ barcodes: barcodes }),
                    success: function(response) {
                        console.log(`Updated ${response.count} barcodes`);
                    },
                    error: function(xhr) {
                        alert('Error updating barcodes');

                        console.error(xhr);
                    }
                });
            });
        });
    </script>
</body>
</html>
