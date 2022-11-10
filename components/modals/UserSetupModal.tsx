import { Dialog, Transition } from '@headlessui/react'
import { useTranslation } from 'next-i18next'
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ModalProps } from '../../types/modal'
import Input from '../forms/Input'
import Label from '../forms/Label'
import Button, { IconButton, LinkButton } from '../shared/Button'
import InlineNotification from '../shared/InlineNotification'
import useLocalStorageState from '../../hooks/useLocalStorageState'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  FireIcon,
  PencilIcon,
  PlusCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
import { useWallet } from '@solana/wallet-adapter-react'
import mangoStore from '@store/mangoStore'
import {
  EnterBottomExitBottom,
  EnterRightExitLeft,
  FadeInFadeOut,
} from '../shared/Transitions'
import Image from 'next/legacy/image'
import BounceLoader from '../shared/BounceLoader'
import { notify } from '../../utils/notifications'
import { Wallet } from '@project-serum/anchor'
import ActionTokenList from '../account/ActionTokenList'
import { walletBalanceForToken } from './DepositModal'
import { floorToDecimal } from '../../utils/numbers'
import { handleWalletConnect } from '../wallet/ConnectWalletButton'
import { IS_ONBOARDED_KEY, MIN_SOL_BALANCE } from '../../utils/constants'
import ParticlesBackground from '../ParticlesBackground'
import ButtonGroup from '../forms/ButtonGroup'
import Decimal from 'decimal.js'
import WalletIcon from '../icons/WalletIcon'
import EditProfileForm from '@components/profile/EditProfileForm'
import EditNftProfilePic from '@components/profile/EditNftProfilePic'
import { TokenInstructions } from '@project-serum/serum'

const UserSetupModal = ({ isOpen, onClose }: ModalProps) => {
  const { t } = useTranslation()
  const group = mangoStore((s) => s.group)
  const { connected, select, wallet, wallets } = useWallet()
  const mangoAccount = mangoStore((s) => s.mangoAccount.current)
  const mangoAccountLoading = mangoStore((s) => s.mangoAccount.initialLoad)
  const [accountName, setAccountName] = useState('')
  const [loadingAccount, setLoadingAccount] = useState(false)
  const [showSetupStep, setShowSetupStep] = useState(0)
  const [depositToken, setDepositToken] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [submitDeposit, setSubmitDeposit] = useState(false)
  const [sizePercentage, setSizePercentage] = useState('')
  const [showEditProfilePic, setShowEditProfilePic] = useState(false)
  const [, setIsOnboarded] = useLocalStorageState(IS_ONBOARDED_KEY)
  const walletTokens = mangoStore((s) => s.wallet.tokens)

  const solBalance = useMemo(() => {
    return (
      walletTokens.find((t) =>
        t.mint.equals(TokenInstructions.WRAPPED_SOL_MINT)
      )?.uiAmount || 0
    )
  }, [walletTokens])

  const handleNextStep = () => {
    setShowSetupStep(showSetupStep + 1)
  }

  const connectWallet = async () => {
    if (wallet) {
      try {
        await handleWalletConnect(wallet)
        setShowSetupStep(2)
        setIsOnboarded(true)
      } catch (e) {
        notify({
          title: 'Setup failed. Refresh and try again.',
          type: 'error',
        })
      }
    }
  }

  const handleCreateAccount = useCallback(async () => {
    const client = mangoStore.getState().client
    const group = mangoStore.getState().group
    const actions = mangoStore.getState().actions
    if (!group || !wallet) return
    setLoadingAccount(true)
    try {
      const tx = await client.createMangoAccount(
        group,
        0,
        accountName || 'Account 1',
        undefined, // tokenCount
        undefined, // serum3Count
        8, // perpCount
        8 // perpOoCount
      )
      actions.fetchMangoAccounts(wallet!.adapter as unknown as Wallet)
      if (tx) {
        setLoadingAccount(false)
        setShowSetupStep(3)
        notify({
          title: t('new-account-success'),
          type: 'success',
          txid: tx,
        })
      }
    } catch (e: any) {
      setLoadingAccount(false)
      notify({
        title: t('new-account-failed'),
        txid: e?.signature,
        type: 'error',
      })
      console.error(e)
    }
  }, [accountName, wallet, t])

  const handleDeposit = useCallback(async () => {
    const client = mangoStore.getState().client
    const group = mangoStore.getState().group
    const actions = mangoStore.getState().actions
    const mangoAccount = mangoStore.getState().mangoAccount.current

    if (!mangoAccount || !group) return
    const bank = group.banksMapByName.get(depositToken)![0]
    try {
      setSubmitDeposit(true)
      const tx = await client.tokenDeposit(
        group,
        mangoAccount,
        bank.mint,
        parseFloat(depositAmount)
      )
      notify({
        title: 'Transaction confirmed',
        type: 'success',
        txid: tx,
      })

      await actions.reloadMangoAccount()
      onClose()
      setSubmitDeposit(false)
    } catch (e: any) {
      notify({
        title: 'Transaction failed',
        description: e.message,
        txid: e?.txid,
        type: 'error',
      })
      setSubmitDeposit(false)
      console.error(e)
    }
  }, [depositAmount, depositToken, onClose])

  useEffect(() => {
    if (mangoAccount && showSetupStep === 2) {
      onClose()
    }
  }, [mangoAccount, showSetupStep, onClose])

  // TODO extract into a shared hook for DepositModal.tsx
  const banks = useMemo(() => {
    const banks = group?.banksMapByName
      ? Array.from(group?.banksMapByName, ([key, value]) => {
          const walletBalance = walletBalanceForToken(walletTokens, key)
          return {
            key,
            value,
            tokenDecimals: walletBalance.maxDecimals,
            walletBalance: floorToDecimal(
              walletBalance.maxAmount,
              walletBalance.maxDecimals
            ).toNumber(),
            walletBalanceValue: walletBalance.maxAmount * value[0]?.uiPrice!,
          }
        })
      : []
    return banks
  }, [group?.banksMapByName, walletTokens])

  const tokenMax = useMemo(() => {
    const bank = banks.find((bank) => bank.key === depositToken)
    if (bank) {
      return { amount: bank.walletBalance, decimals: bank.tokenDecimals }
    }
    return { amount: 0, decimals: 0 }
  }, [banks, depositToken])

  const handleSizePercentage = useCallback(
    (percentage: string) => {
      setSizePercentage(percentage)
      let amount = new Decimal(tokenMax.amount).mul(percentage).div(100)
      if (percentage !== '100') {
        amount = floorToDecimal(amount, tokenMax.decimals)
      }

      setDepositAmount(amount.toString())
    },
    [tokenMax]
  )

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-30 overflow-y-auto"
    >
      <div className="min-h-screen px-4 text-center">
        <Dialog.Overlay
          className={`intro-bg pointer-events-none fixed inset-0 bg-th-bkg-1 opacity-80`}
        />
        {/* <div className="absolute top-6 left-6 z-10" id="repulse">
          <img className="h-10 w-auto" src="/logos/logo-mark.svg" alt="next" />
        </div> */}
        <div className="absolute top-6 right-6 z-10" id="repulse">
          <IconButton hideBg onClick={() => onClose()}>
            <XMarkIcon className="h-6 w-6 text-th-fgd-2" />
          </IconButton>
        </div>
        <div className="absolute bottom-0 left-0 z-10 flex h-1.5 w-full flex-grow bg-th-bkg-3">
          <div
            style={{
              width: `${(showSetupStep / 4) * 100}%`,
            }}
            className="flex rounded bg-th-primary transition-all duration-700 ease-out"
          />
        </div>
        <ParticlesBackground />
        <span className="inline-block h-screen align-middle" aria-hidden="true">
          &#8203;
        </span>
        <div className="m-8 inline-block w-full max-w-md transform overflow-x-hidden rounded-lg p-6 text-left align-middle">
          <div className="h-[420px]">
            <Transition
              appear={true}
              className="absolute top-0.5 left-0 z-20 h-full w-full rounded-lg bg-th-bkg-1 p-6"
              show={showSetupStep === 0}
              enter="transition ease-in duration-500"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition ease-out duration-500"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <h2 className="mb-6 text-4xl">Welcome</h2>
              <p className="mb-4">
                {
                  "You're seconds away from trading the most liquid dex markets on Solana."
                }
              </p>
              <div className="mb-6 space-y-2 border-y border-th-bkg-4 py-4">
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="h-5 w-5 text-th-green" />
                  <p className="text-th-fgd-1">
                    Trusted by 1,000s of DeFi users
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="h-5 w-5 text-th-green" />
                  <p className="text-th-fgd-1">Deeply liquid markets</p>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="h-5 w-5 text-th-green" />
                  <p className="text-th-fgd-1">
                    Up to 20x leverage across 100s of tokens
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="h-5 w-5 text-th-green" />
                  <p className="text-th-fgd-1">
                    Earn interest on your deposits
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="h-5 w-5 text-th-green" />
                  <p className="text-th-fgd-1">
                    Borrow 100s of tokens with many collateral options
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={handleNextStep} size="large">
                <div className="flex items-center justify-center">
                  <FireIcon className="mr-2 h-5 w-5" />
                  {"Let's Go"}
                </div>
              </Button>
            </Transition>
            <EnterRightExitLeft
              className="absolute top-0.5 left-0 z-20 w-full rounded-lg bg-th-bkg-1 p-6"
              show={showSetupStep === 1}
              style={{ height: 'calc(100% - 12px)' }}
            >
              {connected && mangoAccountLoading ? (
                <div className="flex h-full items-center justify-center">
                  <BounceLoader />
                </div>
              ) : (
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-4">
                      <h2 className="mb-6 text-4xl">Connect Wallet</h2>
                    </div>
                    <p className="mb-2">Choose Wallet</p>
                    <div className="thin-scroll grid max-h-56 grid-flow-row grid-cols-3 gap-2 overflow-y-auto">
                      {wallets?.map((w) => (
                        <button
                          className={`col-span-1 rounded-md border py-3 px-4 text-base font-normal focus:outline-none md:hover:cursor-pointer md:hover:border-th-fgd-4 ${
                            w.adapter.name === wallet?.adapter.name
                              ? 'border-th-primary text-th-fgd-1 md:hover:border-th-primary'
                              : 'border-th-bkg-4 text-th-fgd-4'
                          }`}
                          onClick={() => {
                            select(w.adapter.name)
                          }}
                          key={w.adapter.name}
                        >
                          <div className="flex items-center">
                            <img
                              src={w.adapter.icon}
                              className="mr-2 h-5 w-5"
                              alt={`${w.adapter.name} icon`}
                            />
                            {w.adapter.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={connectWallet}
                    size="large"
                  >
                    <div className="flex items-center justify-center">
                      <WalletIcon className="mr-2 h-5 w-5" />
                      Connect Wallet
                    </div>
                  </Button>
                </div>
              )}
            </EnterRightExitLeft>
            <EnterRightExitLeft
              className="absolute top-0.5 left-0 z-20 w-full rounded-lg bg-th-bkg-1 p-6"
              show={showSetupStep === 2}
              style={{ height: 'calc(100% - 12px)' }}
            >
              {loadingAccount ? (
                <div className="flex h-full items-center justify-center">
                  <BounceLoader loadingMessage="Creating Account..." />
                </div>
              ) : (
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="pb-4">
                      <h2 className="mb-6 text-4xl">Create Account</h2>
                      <p>You need a Mango Account to get started.</p>
                    </div>
                    <div className="pb-4">
                      <Label text="Account Name" optional />
                      <Input
                        type="text"
                        name="name"
                        id="name"
                        placeholder="Account"
                        value={accountName}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setAccountName(e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-6">
                    <InlineNotification
                      type="info"
                      desc={t('insufficient-sol')}
                    />
                    <div className="space-y-4">
                      <Button
                        className="w-full"
                        disabled={solBalance < MIN_SOL_BALANCE}
                        onClick={() => handleCreateAccount()}
                        size="large"
                      >
                        <div className="flex items-center justify-center">
                          <PlusCircleIcon className="mr-2 h-5 w-5" />
                          Create Account
                        </div>
                      </Button>
                      {solBalance < MIN_SOL_BALANCE ? (
                        <InlineNotification
                          type="error"
                          desc={t('deposit-more-sol')}
                        />
                      ) : null}
                      <LinkButton
                        className="flex w-full justify-center"
                        onClick={onClose}
                      >
                        <span className="default-transition text-th-fgd-4 underline md:hover:text-th-fgd-3 md:hover:no-underline">
                          Skip for now
                        </span>
                      </LinkButton>
                    </div>
                  </div>
                </div>
              )}
            </EnterRightExitLeft>
            <EnterRightExitLeft
              className="absolute top-0.5 left-0 z-20 w-full rounded-lg bg-th-bkg-1 p-6"
              show={showSetupStep === 3}
              style={{ height: 'calc(100% - 12px)' }}
            >
              {submitDeposit ? (
                <div className="flex h-full items-center justify-center">
                  <BounceLoader loadingMessage="Funding your account..." />
                </div>
              ) : (
                <div className="flex h-full flex-col justify-between">
                  <div className="relative">
                    <h2 className="mb-6 text-4xl">Fund Your Account</h2>
                    <FadeInFadeOut show={!!depositToken}>
                      <div className="flex justify-between">
                        <Label text="Amount" />
                        <LinkButton
                          className="mb-2 no-underline"
                          onClick={() =>
                            setDepositAmount(
                              floorToDecimal(
                                tokenMax.amount,
                                tokenMax.decimals
                              ).toFixed()
                            )
                          }
                        >
                          <span className="mr-1 text-sm font-normal text-th-fgd-4">
                            {t('wallet-balance')}:
                          </span>
                          <span className="text-th-fgd-1 underline">
                            {floorToDecimal(
                              tokenMax.amount,
                              tokenMax.decimals
                            ).toFixed()}
                          </span>
                        </LinkButton>
                      </div>
                      <div className="grid grid-cols-2">
                        <button
                          className="col-span-1 flex items-center rounded-lg rounded-r-none border border-r-0 border-th-bkg-4 bg-transparent px-4 hover:bg-transparent"
                          onClick={() => setDepositToken('')}
                        >
                          <div className="ml-1.5 flex w-full items-center justify-between">
                            <div className="flex items-center">
                              <Image
                                alt=""
                                width="20"
                                height="20"
                                src={`/icons/${depositToken.toLowerCase()}.svg`}
                              />
                              <p className="ml-1.5 text-xl font-bold text-th-fgd-1">
                                {depositToken}
                              </p>
                            </div>
                            <PencilIcon className="ml-2 h-5 w-5 text-th-fgd-3" />
                          </div>
                        </button>
                        <Input
                          className="col-span-1 w-full rounded-lg rounded-l-none border border-th-bkg-4 bg-transparent p-3 text-right text-xl font-bold tracking-wider text-th-fgd-1 focus:outline-none"
                          type="text"
                          name="deposit"
                          id="deposit"
                          placeholder="0.00"
                          value={depositAmount}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setDepositAmount(e.target.value)
                          }
                        />
                        <div className="col-span-2 mt-2">
                          <ButtonGroup
                            activeValue={sizePercentage}
                            onChange={(p) => handleSizePercentage(p)}
                            values={['10', '25', '50', '75', '100']}
                            unit="%"
                          />
                        </div>
                      </div>
                    </FadeInFadeOut>
                    {!depositToken ? (
                      <div className="thin-scroll absolute top-14 mt-2 h-52 w-full overflow-auto">
                        <div className="grid auto-cols-fr grid-flow-col px-4 pb-2">
                          <div className="">
                            <p className="text-xs">{t('token')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs">{t('deposit-rate')}</p>
                          </div>
                          <div className="text-right">
                            <p className="whitespace-nowrap text-xs">
                              {t('wallet-balance')}
                            </p>
                          </div>
                        </div>
                        <ActionTokenList
                          banks={banks}
                          onSelect={setDepositToken}
                          showDepositRates
                          sortByKey="walletBalanceValue"
                          valueKey="walletBalance"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-center">
                    <Button
                      className="mb-4 w-full"
                      disabled={!depositAmount || !depositToken}
                      onClick={handleDeposit}
                      size="large"
                    >
                      <div className="flex items-center justify-center">
                        <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
                        Deposit
                      </div>
                    </Button>
                    <LinkButton onClick={onClose}>
                      <span className="default-transition text-th-fgd-4 underline md:hover:text-th-fgd-3 md:hover:no-underline">
                        Skip for now
                      </span>
                    </LinkButton>
                  </div>
                </div>
              )}
            </EnterRightExitLeft>
            <EnterRightExitLeft
              className="absolute top-0.5 left-0 z-20 w-full rounded-lg bg-th-bkg-1 p-6"
              show={showSetupStep === 4}
              style={{ height: 'calc(100% - 12px)' }}
            >
              <h2 className="mb-2 text-4xl">Your Profile</h2>
              <p className="text-sm">
                Add an NFT profile pic and edit your assigned name. Your profile
                will be used for social features in the app.
              </p>
              <EditProfileForm
                onFinish={onClose}
                onEditProfileImage={() => setShowEditProfilePic(true)}
              />
              <LinkButton className="mx-auto mt-4" onClick={onClose}>
                <span className="default-transition text-th-fgd-4 underline md:hover:text-th-fgd-3 md:hover:no-underline">
                  Skip and Finish
                </span>
              </LinkButton>
              <EnterBottomExitBottom
                className="absolute bottom-0 left-0 z-20 h-full w-full overflow-auto bg-th-bkg-1 p-6"
                show={showEditProfilePic}
              >
                <EditNftProfilePic
                  onClose={() => setShowEditProfilePic(false)}
                />
              </EnterBottomExitBottom>
            </EnterRightExitLeft>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

export default UserSetupModal
