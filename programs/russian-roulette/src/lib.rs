use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("RouG1111111111111111111111111111111111111");

#[program]
pub mod russian_roulette {
    use super::*;

    /// Host creates a multiplayer game and deposits their bet into the vault.
    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: u64,
        bullets: u8,
        min_players: u8,
        max_players: u8,
        min_bet: u64,
        host_bet: u64,
    ) -> Result<()> {
        require!(bullets >= 1 && bullets <= 5, RouletteError::InvalidBullets);
        require!(min_players >= 2 && min_players <= 8, RouletteError::InvalidPlayerCount);
        require!(max_players >= min_players && max_players <= 8, RouletteError::InvalidPlayerCount);
        require!(host_bet >= min_bet, RouletteError::BetTooLow);

        let game = &mut ctx.accounts.game;
        game.host = ctx.accounts.host.key();
        game.game_id = game_id;
        game.bullets = bullets;
        game.min_players = min_players;
        game.max_players = max_players;
        game.min_bet = min_bet;
        game.player_count = 1;
        game.agreed_count = 0;
        game.total_pot = host_bet;
        game.status = GameStatus::Lobby;
        game.winner = Pubkey::default();
        game.bump = ctx.bumps.game;
        game.vault_bump = ctx.bumps.vault;

        let player = &mut ctx.accounts.host_player;
        player.game = game.key();
        player.player = ctx.accounts.host.key();
        player.bet = host_bet;
        player.agreed = false;
        player.bump = ctx.bumps.host_player;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.host.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            host_bet,
        )?;

        Ok(())
    }

    /// Player joins lobby and deposits bet into vault.
    pub fn join_game(ctx: Context<JoinGame>, bet: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.status == GameStatus::Lobby, RouletteError::GameNotInLobby);
        require!(game.player_count < game.max_players, RouletteError::LobbyFull);
        require!(bet >= game.min_bet, RouletteError::BetTooLow);

        let player = &mut ctx.accounts.player;
        player.game = game.key();
        player.player = ctx.accounts.joiner.key();
        player.bet = bet;
        player.agreed = false;
        player.bump = ctx.bumps.player;

        game.player_count += 1;
        game.total_pot = game.total_pot.checked_add(bet).ok_or(RouletteError::Overflow)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.joiner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            bet,
        )?;

        Ok(())
    }

    /// Player agrees to host rules.
    pub fn agree(ctx: Context<Agree>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player = &mut ctx.accounts.player;

        require!(game.status == GameStatus::Lobby, RouletteError::GameNotInLobby);
        require!(!player.agreed, RouletteError::AlreadyAgreed);

        player.agreed = true;
        game.agreed_count += 1;

        Ok(())
    }

    /// Host starts game once everyone agreed.
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;

        require!(game.status == GameStatus::Lobby, RouletteError::GameNotInLobby);
        require!(
            game.player_count >= game.min_players,
            RouletteError::NotEnoughPlayers
        );
        require!(
            game.agreed_count == game.player_count,
            RouletteError::NotAllAgreed
        );

        game.status = GameStatus::Playing;
        Ok(())
    }

    /// Host settles game — vault pays winner (game outcome verified off-chain in v1).
    pub fn settle_winner(ctx: Context<SettleWinner>) -> Result<()> {
        let game = &mut ctx.accounts.game;

        require!(game.status == GameStatus::Playing, RouletteError::GameNotPlaying);
        require!(
            ctx.accounts.winner.key() == game.winner,
            RouletteError::InvalidWinner
        );

        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        let rent = Rent::get()?.minimum_balance(0);
        let payout = vault_lamports.saturating_sub(rent);

        require!(payout > 0, RouletteError::EmptyVault);

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += payout;

        game.status = GameStatus::Settled;
        Ok(())
    }

    /// Host sets winner pubkey before settlement.
    pub fn declare_winner(ctx: Context<DeclareWinner>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.status == GameStatus::Playing, RouletteError::GameNotPlaying);
        game.winner = ctx.accounts.winner.key();
        Ok(())
    }

    /// Host cancels lobby — call refund_player for each participant afterward.
    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.status == GameStatus::Lobby, RouletteError::GameNotInLobby);
        game.status = GameStatus::Cancelled;
        Ok(())
    }

    /// Refund one player from vault after cancel (host-only).
    pub fn refund_player(ctx: Context<RefundPlayer>) -> Result<()> {
        let game = &ctx.accounts.game;
        require!(
            game.status == GameStatus::Cancelled,
            RouletteError::GameNotInLobby
        );

        let refund = ctx.accounts.player_account.bet;
        require!(refund > 0, RouletteError::BetTooLow);

        let vault_info = ctx.accounts.vault.to_account_info();
        require!(vault_info.lamports() >= refund, RouletteError::InsufficientVault);

        **vault_info.try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.player_wallet.to_account_info().try_borrow_mut_lamports()? += refund;

        Ok(())
    }

    /// Single-player: lock stake in session vault.
    pub fn create_solo_session(ctx: Context<CreateSoloSession>, session_id: u64, stake: u64) -> Result<()> {
        require!(stake > 0, RouletteError::BetTooLow);

        let session = &mut ctx.accounts.session;
        session.player = ctx.accounts.player.key();
        session.session_id = session_id;
        session.stake = stake;
        session.vault_bump = ctx.bumps.vault;
        session.bump = ctx.bumps.session;
        session.settled = false;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            stake,
        )?;

        Ok(())
    }

    /// Single-player: cash out winnings from session vault.
    pub fn solo_cashout(ctx: Context<SoloCashout>, payout: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(!session.settled, RouletteError::AlreadySettled);
        require!(payout > 0, RouletteError::BetTooLow);

        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        require!(payout <= vault_lamports, RouletteError::InsufficientVault);

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += payout;

        session.settled = true;
        Ok(())
    }

    /// Single-player: forfeit remaining vault to treasury on loss.
    pub fn solo_forfeit(ctx: Context<SoloForfeit>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(!session.settled, RouletteError::AlreadySettled);

        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        if vault_lamports > 0 {
            **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= vault_lamports;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += vault_lamports;
        }

        session.settled = true;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GameStatus {
    Lobby,
    Playing,
    Settled,
    Cancelled,
}

impl anchor_lang::Space for GameStatus {
    const INIT_SPACE: usize = 1;
}

#[account]
pub struct Game {
    pub host: Pubkey,
    pub game_id: u64,
    pub bullets: u8,
    pub min_players: u8,
    pub max_players: u8,
    pub min_bet: u64,
    pub player_count: u8,
    pub agreed_count: u8,
    pub total_pot: u64,
    pub status: GameStatus,
    pub winner: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Game {
    pub const INIT_SPACE: usize = 32 + 8 + 1 + 1 + 1 + 8 + 1 + 1 + 8 + 1 + 32 + 1 + 1;
}

#[account]
pub struct PlayerAccount {
    pub game: Pubkey,
    pub player: Pubkey,
    pub bet: u64,
    pub agreed: bool,
    pub bump: u8,
}

impl PlayerAccount {
    pub const INIT_SPACE: usize = 32 + 32 + 8 + 1 + 1;
}

#[account]
pub struct SoloSession {
    pub player: Pubkey,
    pub session_id: u64,
    pub stake: u64,
    pub settled: bool,
    pub vault_bump: u8,
    pub bump: u8,
}

impl SoloSession {
    pub const INIT_SPACE: usize = 32 + 8 + 8 + 1 + 1 + 1;
}

#[derive(Accounts)]
#[instruction(game_id: u64, host_bet: u64)]
pub struct CreateGame<'info> {
    #[account(mut)]
    pub host: Signer<'info>,

    #[account(
        init,
        payer = host,
        space = 8 + Game::INIT_SPACE,
        seeds = [b"game", host.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = host,
        space = 8 + PlayerAccount::INIT_SPACE,
        seeds = [b"player", game.key().as_ref(), host.key().as_ref()],
        bump
    )]
    pub host_player: Account<'info, PlayerAccount>,

    /// CHECK: vault PDA holds SOL
    #[account(
        mut,
        seeds = [b"vault", game.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,

    #[account(mut)]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = joiner,
        space = 8 + PlayerAccount::INIT_SPACE,
        seeds = [b"player", game.key().as_ref(), joiner.key().as_ref()],
        bump
    )]
    pub player: Account<'info, PlayerAccount>,

    /// CHECK: vault PDA
    #[account(
        mut,
        seeds = [b"vault", game.key().as_ref()],
        bump = game.vault_bump
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Agree<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(mut)]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump = player_account.bump,
        has_one = game,
        constraint = player_account.player == player.key() @ RouletteError::InvalidPlayer
    )]
    pub player_account: Account<'info, PlayerAccount>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(mut, has_one = host @ RouletteError::Unauthorized)]
    pub game: Account<'info, Game>,
    pub host: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeclareWinner<'info> {
    #[account(mut, has_one = host @ RouletteError::Unauthorized)]
    pub game: Account<'info, Game>,
    pub host: Signer<'info>,
    /// CHECK: winner pubkey stored on game
    pub winner: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettleWinner<'info> {
    #[account(mut, has_one = host @ RouletteError::Unauthorized)]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub host: Signer<'info>,

    /// CHECK: winner receives vault funds
    #[account(mut, address = game.winner @ RouletteError::InvalidWinner)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: vault PDA
    #[account(
        mut,
        seeds = [b"vault", game.key().as_ref()],
        bump = game.vault_bump
    )]
    pub vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(mut, has_one = host @ RouletteError::Unauthorized)]
    pub game: Account<'info, Game>,

    pub host: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundPlayer<'info> {
    #[account(has_one = host @ RouletteError::Unauthorized)]
    pub game: Account<'info, Game>,

    pub host: Signer<'info>,

    #[account(
        seeds = [b"player", game.key().as_ref(), player_wallet.key().as_ref()],
        bump = player_account.bump,
        has_one = game
    )]
    pub player_account: Account<'info, PlayerAccount>,

    /// CHECK: player wallet receives refund
    #[account(mut, address = player_account.player @ RouletteError::InvalidPlayer)]
    pub player_wallet: UncheckedAccount<'info>,

    /// CHECK: vault PDA
    #[account(
        mut,
        seeds = [b"vault", game.key().as_ref()],
        bump = game.vault_bump
    )]
    pub vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(session_id: u64)]
pub struct CreateSoloSession<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        init,
        payer = player,
        space = 8 + SoloSession::INIT_SPACE,
        seeds = [b"solo", player.key().as_ref(), &session_id.to_le_bytes()],
        bump
    )]
    pub session: Account<'info, SoloSession>,

    /// CHECK: session vault
    #[account(
        mut,
        seeds = [b"solo_vault", session.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SoloCashout<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"solo", player.key().as_ref(), &session.session_id.to_le_bytes()],
        bump = session.bump,
        has_one = player
    )]
    pub session: Account<'info, SoloSession>,

    /// CHECK: session vault
    #[account(
        mut,
        seeds = [b"solo_vault", session.key().as_ref()],
        bump = session.vault_bump
    )]
    pub vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SoloForfeit<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"solo", player.key().as_ref(), &session.session_id.to_le_bytes()],
        bump = session.bump,
        has_one = player
    )]
    pub session: Account<'info, SoloSession>,

    /// CHECK: session vault
    #[account(
        mut,
        seeds = [b"solo_vault", session.key().as_ref()],
        bump = session.vault_bump
    )]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: treasury receives forfeited stakes
    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: UncheckedAccount<'info>,
}

#[error_code]
pub enum RouletteError {
    #[msg("Invalid bullet count (1-5 only)")]
    InvalidBullets,
    #[msg("Invalid player count settings")]
    InvalidPlayerCount,
    #[msg("Bet is below minimum")]
    BetTooLow,
    #[msg("Game is not in lobby")]
    GameNotInLobby,
    #[msg("Lobby is full")]
    LobbyFull,
    #[msg("Player already agreed")]
    AlreadyAgreed,
    #[msg("Not enough players to start")]
    NotEnoughPlayers,
    #[msg("All players must agree first")]
    NotAllAgreed,
    #[msg("Game is not in playing state")]
    GameNotPlaying,
    #[msg("Invalid winner")]
    InvalidWinner,
    #[msg("Vault is empty")]
    EmptyVault,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid player account")]
    InvalidPlayer,
    #[msg("Numeric overflow")]
    Overflow,
    #[msg("Session already settled")]
    AlreadySettled,
    #[msg("Insufficient vault balance")]
    InsufficientVault,
}
