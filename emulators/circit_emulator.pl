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

# CORS
app->hook(after_dispatch => sub {
    my $c = shift;
    my $headers = $c->res->headers;

    $headers->header('Access-Control-Allow-Origin'  => '*');
    $headers->header('Access-Control-Allow-Methods' => 'GET, OPTIONS, POST, DELETE, PUT');
    $headers->header('Access-Control-Allow-Headers' => 'Content-Type, application/x-www-form-urlencoded');
});

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
        $config->{barcodes}{$b} //= { security => \1, barcode => $b };
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
    # Convert the barcodes hash into the expected array format
    my @items = map { 
        { 
            barcode => $_,
            security => ${$config->{barcodes}->{$_}->{security}} ? \1 : \0
        }
    } keys %{ $config->{barcodes} };
    
    return $c->render(
        json => {
            status => Mojo::JSON->true,
            items => \@items
        }
    );
};

get '/setsecurity/:barcode/:security_bit' => sub ($c) {
    my $barcode = $c->param('barcode');
    my $security_bit = $c->param('security_bit');

    if ( $config->{barcodes}->{$barcode} ) {
        $config->{barcodes}->{$barcode}->{security} = $security_bit eq 'true' ? \1 : \0;

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

<h3>Tech Logic CircIt RFID Emulator</h3>
<div class="container mt-5">
    <div class="row">
        <div class="col-md-6">
            <div class="card mb-4">
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
        
        <div class="col-md-6">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Current Barcodes</h5>
                    <span class="badge bg-secondary" id="lastUpdated">Updating...</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Barcode</th>
                                    <th>Security</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="barcodeTableBody">
                                <tr>
                                    <td colspan="3" class="text-center">Loading barcodes...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
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
        function updateBarcodeTable() {
            $.getJSON('/getitems', function(response) {
                if (response.status && response.items) {
                    const tbody = $('#barcodeTableBody');
                    tbody.empty();
                    
                    if (Object.keys(response.items).length === 0) {
                        tbody.html('<tr><td colspan="3" class="text-center">No barcodes loaded</td></tr>');
                    } else {
                        Object.entries(response.items).forEach(([idx, data]) => {
                            const barcode = data.barcode;
                            const securityStatus = data.security ? 'true' : 'false';
                            const securityClass = data.security ? 'text-success' : 'text-danger';
                            const securityText = data.security ? 'Active' : 'Inactive';
                            
                            tbody.append(`
                                <tr>
                                    <td>${barcode}</td>
                                    <td class="${securityClass}">${securityText}</td>
                                    <td>
                                        <div class="form-check form-switch">
                                            <input class="form-check-input security-toggle" 
                                                   type="checkbox" 
                                                   ${data.security ? 'checked' : ''}
                                                   data-barcode="${barcode}">
                                        </div>
                                    </td>
                                </tr>
                            `);
                        });
                    }
                    
                    // Update last updated time
                    const now = new Date();
                    $('#lastUpdated').text('Updated: ' + now.toLocaleTimeString());
                }
            }).fail(function() {
                $('#barcodeTableBody').html('<tr><td colspan="3" class="text-center text-danger">Error loading barcodes</td></tr>');
            });
        }
        
        // Toggle security status
        $(document).on('change', '.security-toggle', function() {
            const barcode = $(this).data('barcode');
            const securityBit = $(this).is(':checked');
            
            $.get(`/setsecurity/${barcode}/${securityBit}`, function(r) {
                // Update the row's appearance after successful update
                const row = $(`[data-barcode="${barcode}"]`).closest('tr');
                const statusCell = row.find('td:eq(1)');
                
                if (securityBit) {
                    statusCell.removeClass('text-danger').addClass('text-success').text('Active');
                } else {
                    statusCell.removeClass('text-success').addClass('text-danger').text('Inactive');
                }
            }).fail(function() {
                // Revert the toggle if update fails
                $(this).prop('checked', !securityBit);
                alert('Failed to update security status');
            });
        });
        
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
                        // Refresh the barcode table after update
                        updateBarcodeTable();
                    },
                    error: function(xhr) {
                        alert('Error updating barcodes');
                        console.error(xhr);
                    }
                });
            });
            
            // Initial load and set up auto-refresh
            updateBarcodeTable();
            setInterval(updateBarcodeTable, 1000);
        });
    </script>
</body>
</html>
