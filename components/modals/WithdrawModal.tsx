import {
  Bank,
  Group,
  HealthType,
  MangoAccount,
} from '@blockworks-foundation/mango-v4'
import { ChevronDownIcon, ExclamationCircleIcon } from '@heroicons/react/solid'
import { useTranslation } from 'next-i18next'
import Image from 'next/image'
import { ChangeEvent, useCallback, useMemo, useState } from 'react'

import mangoStore from '../../store/mangoStore'
import { ModalProps } from '../../types/modal'
import { INPUT_TOKEN_DEFAULT } from '../../utils/constants'
import { notify } from '../../utils/notifications'
import { floorToDecimal } from '../../utils/numbers'
import ActionTokenList from '../account/ActionTokenList'
import ButtonGroup from '../forms/ButtonGroup'
import Input from '../forms/Input'
import Label from '../forms/Label'
import Button, { LinkButton } from '../shared/Button'
import HealthImpact from '../shared/HealthImpact'
import InlineNotification from '../shared/InlineNotification'
import Loading from '../shared/Loading'
import Modal from '../shared/Modal'
import { EnterBottomExitBottom, FadeInFadeOut } from '../shared/Transitions'

interface WithdrawModalProps {
  token?: string
}

const getMaxWithdrawWithoutBorrow = (
  group: Group,
  bank: Bank,
  mangoAccount: MangoAccount
): number => {
  const accountBalance = mangoAccount?.getTokenBalanceUi(bank)
  const vaultBalance = group.getTokenVaultBalanceByMintUi(bank.mint)
  const maxBorrow = mangoAccount?.getMaxWithdrawWithBorrowForTokenUi(
    group,
    bank.mint
  )
  return Math.min(accountBalance, vaultBalance, maxBorrow)
}

type ModalCombinedProps = WithdrawModalProps & ModalProps

function WithdrawModal({ isOpen, onClose, token }: ModalCombinedProps) {
  const { t } = useTranslation(['common', 'trade'])
  const group = mangoStore((s) => s.group)
  const [inputAmount, setInputAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedToken, setSelectedToken] = useState(
    token || INPUT_TOKEN_DEFAULT
  )
  const [showTokenList, setShowTokenList] = useState(false)
  const [sizePercentage, setSizePercentage] = useState('')
  const jupiterTokens = mangoStore((s) => s.jupiterTokens)

  const bank = useMemo(() => {
    const group = mangoStore.getState().group
    return group?.banksMapByName.get(selectedToken)![0]
  }, [selectedToken])

  const logoUri = useMemo(() => {
    let logoURI
    if (jupiterTokens.length) {
      logoURI = jupiterTokens.find(
        (t) => t.address === bank?.mint.toString()
      )!.logoURI
    }
    return logoURI
  }, [bank?.mint, jupiterTokens])

  const mangoAccount = mangoStore((s) => s.mangoAccount.current)

  const tokenMax = useMemo(() => {
    if (!bank || !mangoAccount || !group) return 0
    const amount = getMaxWithdrawWithoutBorrow(group, bank, mangoAccount)
    return amount && amount > 0 ? floorToDecimal(amount, bank.mintDecimals) : 0
  }, [mangoAccount, bank, group])

  const handleSizePercentage = useCallback(
    (percentage: string) => {
      setSizePercentage(percentage)
      const amount = (Number(percentage) / 100) * (tokenMax || 0)
      setInputAmount(amount.toString())
    },
    [tokenMax]
  )

  const handleWithdraw = async () => {
    const client = mangoStore.getState().client
    const group = mangoStore.getState().group
    const mangoAccount = mangoStore.getState().mangoAccount.current
    const actions = mangoStore.getState().actions
    if (!mangoAccount || !group) return
    setSubmitting(true)
    try {
      const tx = await client.tokenWithdraw(
        group,
        mangoAccount,
        bank!.mint,
        parseFloat(inputAmount),
        false
      )
      notify({
        title: 'Transaction confirmed',
        type: 'success',
        txid: tx,
      })
      actions.reloadMangoAccount()
    } catch (e: any) {
      console.error(e)
      notify({
        title: 'Transaction failed',
        description: e.message,
        txid: e?.txid,
        type: 'error',
      })
    } finally {
      setSubmitting(false)
      onClose()
    }
  }

  const handleSelectToken = (token: string) => {
    setSelectedToken(token)
    setShowTokenList(false)
  }

  const withdrawBank = useMemo(() => {
    if (mangoAccount) {
      const banks = group?.banksMapByName
        ? Array.from(group?.banksMapByName, ([key, value]) => {
            const accountBalance = getMaxWithdrawWithoutBorrow(
              group,
              value[0],
              mangoAccount
            )
            return {
              key,
              value,
              accountBalance: accountBalance ? accountBalance : 0,
              accountBalanceValue:
                accountBalance && value[0]?.uiPrice
                  ? accountBalance * value[0]?.uiPrice
                  : 0,
            }
          })
        : []
      return banks.filter((b) => b.accountBalance > 0)
    }
    return []
  }, [mangoAccount, group])

  const initHealth = useMemo(() => {
    return mangoAccount ? mangoAccount.getHealthRatioUi(HealthType.init) : 100
  }, [mangoAccount])

  const showInsufficientBalance = tokenMax < Number(inputAmount)

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="h-[420px]">
        <EnterBottomExitBottom
          className="absolute bottom-0 left-0 z-20 h-full w-full overflow-auto bg-th-bkg-1 p-6"
          show={showTokenList}
        >
          <h2 className="mb-4 text-center">{t('select-token')}</h2>
          <div className="grid auto-cols-fr grid-flow-col  px-4 pb-2">
            <div className="">
              <p className="text-xs">{t('token')}</p>
            </div>
            <div className="flex justify-end">
              <p className="text-xs">{t('available-balance')}</p>
            </div>
          </div>
          <ActionTokenList
            banks={withdrawBank}
            onSelect={handleSelectToken}
            sortByKey="accountBalanceValue"
            valueKey="accountBalance"
          />
        </EnterBottomExitBottom>
        <FadeInFadeOut
          className="flex h-full flex-col justify-between"
          show={isOpen}
        >
          <div>
            <h2 className="mb-4 text-center">{t('withdraw')}</h2>
            {initHealth <= 0 ? (
              <div className="mb-4">
                <InlineNotification
                  type="error"
                  desc="You have no available collateral to withdraw."
                />
              </div>
            ) : null}
            <div className="grid grid-cols-2 pb-6">
              <div className="col-span-2 flex justify-between">
                <Label text={t('token')} />
                <LinkButton
                  className="mb-2 no-underline"
                  onClick={() => handleSizePercentage('100')}
                >
                  <span className="mr-1 font-normal text-th-fgd-4">
                    {t('max')}:
                  </span>
                  <span className="text-th-fgd-1 underline">{tokenMax}</span>
                </LinkButton>
              </div>
              <div className="col-span-1 rounded-lg rounded-r-none border border-r-0 border-th-bkg-4 bg-th-bkg-1">
                <button
                  onClick={() => setShowTokenList(true)}
                  className="default-transition flex h-full w-full items-center rounded-lg rounded-r-none py-2 px-3 text-th-fgd-2 hover:cursor-pointer hover:bg-th-bkg-2 hover:text-th-fgd-1"
                >
                  <div className="mr-2.5 flex min-w-[24px] items-center">
                    <Image
                      alt=""
                      width="24"
                      height="24"
                      src={
                        logoUri || `/icons/${selectedToken.toLowerCase()}.svg`
                      }
                    />
                  </div>
                  <div className="flex w-full items-center justify-between">
                    <div className="text-xl font-bold">{selectedToken}</div>
                    <ChevronDownIcon className="h-6 w-6" />
                  </div>
                </button>
              </div>
              <div className="col-span-1">
                <Input
                  type="text"
                  name="withdraw"
                  id="withdraw"
                  className="w-full rounded-lg rounded-l-none border border-th-bkg-4 bg-th-bkg-1 p-3 text-right text-xl font-bold tracking-wider text-th-fgd-1 focus:outline-none"
                  placeholder="0.00"
                  value={inputAmount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setInputAmount(e.target.value)
                  }
                />
              </div>
              <div className="col-span-2 mt-2">
                <ButtonGroup
                  activeValue={sizePercentage}
                  onChange={(p) => handleSizePercentage(p)}
                  values={['10', '25', '50', '75', '100']}
                  unit="%"
                />
              </div>
            </div>
            <div className="space-y-2 border-y border-th-bkg-3 px-2 py-4">
              <HealthImpact
                mintPk={bank!.mint}
                uiAmount={parseFloat(inputAmount)}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              onClick={handleWithdraw}
              className="flex w-full items-center justify-center"
              size="large"
              disabled={
                !inputAmount || showInsufficientBalance || initHealth <= 0
              }
            >
              {submitting ? (
                <Loading className="mr-2 h-5 w-5" />
              ) : showInsufficientBalance ? (
                <div className="flex items-center">
                  <ExclamationCircleIcon className="mr-2 h-5 w-5 flex-shrink-0" />
                  {t('trade:insufficient-balance', {
                    symbol: selectedToken,
                  })}
                </div>
              ) : (
                t('withdraw')
              )}
            </Button>
          </div>
        </FadeInFadeOut>
      </div>
    </Modal>
  )
}

export default WithdrawModal
