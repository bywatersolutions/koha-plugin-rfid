#!/usr/bin/perl

# This file is part of Koha.
#
# Koha is free software; you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 3 of the License, or
# (at your option) any later version.
#
# Koha is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Koha; if not, see <http://www.gnu.org/licenses>.

use Modern::Perl;

use Test::More tests => 3;
use Test::NoWarnings;
use Test::MockModule;

use FindBin;
use lib "$FindBin::Bin/..";

use_ok('Koha::Plugin::Com::ByWaterSolutions::RFID');

my $plugin = Koha::Plugin::Com::ByWaterSolutions::RFID->new();

# Drive resolve_halt from a controllable store instead of the database, so this
# is a true unit test of the per-branch / global / default precedence.
my %store;
my $module = Test::MockModule->new('Koha::Plugin::Com::ByWaterSolutions::RFID');
$module->mock( 'retrieve_data', sub { my ( $self, $key ) = @_; return $store{$key}; } );

subtest 'resolve_halt() precedence tests' => sub {
    plan tests => 9;

    # Nothing stored: the catalog default is used
    %store = ();
    is( $plugin->resolve_halt( 'ret_withdrawn', 'CPL', 1 ), 1, 'default 1 used when nothing is set' );
    is( $plugin->resolve_halt( 'ret_notissued', 'CPL', 0 ), 0, 'default 0 used when nothing is set' );

    # A global setting overrides the default
    %store = ( 'rfid_halt_ret_withdrawn' => '0' );
    is( $plugin->resolve_halt( 'ret_withdrawn', 'CPL', 1 ), 0, 'global 0 overrides default 1' );
    %store = ( 'rfid_halt_ret_notissued' => '1' );
    is( $plugin->resolve_halt( 'ret_notissued', 'CPL', 0 ), 1, 'global 1 overrides default 0' );

    # A per-branch override beats the global setting, but only for that branch
    %store = ( 'rfid_halt_ret_withdrawn' => '0', 'rfid_halt_ret_withdrawn_branch_CPL' => '1' );
    is( $plugin->resolve_halt( 'ret_withdrawn', 'CPL', 1 ), 1, 'branch override 1 beats global 0' );
    is( $plugin->resolve_halt( 'ret_withdrawn', 'MPL', 1 ), 0, 'a different branch still uses global 0' );

    %store = ( 'rfid_halt_ret_withdrawn' => '1', 'rfid_halt_ret_withdrawn_branch_CPL' => '0' );
    is( $plugin->resolve_halt( 'ret_withdrawn', 'CPL', 1 ), 0, 'branch override 0 beats global 1' );

    # An empty string is treated as unset ( inherit ), so it falls through
    %store = ( 'rfid_halt_ret_withdrawn' => q{}, 'rfid_halt_ret_withdrawn_branch_CPL' => q{} );
    is( $plugin->resolve_halt( 'ret_withdrawn', 'CPL', 1 ), 1, 'empty strings inherit down to the default' );

    # With no branch, the override layer is skipped entirely
    %store = ( 'rfid_halt_ret_withdrawn' => '1' );
    is( $plugin->resolve_halt( 'ret_withdrawn', q{}, 0 ), 1, 'empty branch uses the global setting' );
};
